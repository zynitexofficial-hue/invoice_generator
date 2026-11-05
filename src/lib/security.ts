/**
 * Security and cryptographic helpers for the PIN screen lock.
 *
 * All operations use the standard Web Crypto API (`crypto.subtle`) available in
 * both modern browsers and Node.js environments.
 * The 6-digit PIN is never stored in plain text — it is salted with a random 16-byte
 * cryptographic salt and derived using PBKDF2 with SHA-256 (600,000 iterations
 * for new PINs; older 100,000-iteration hashes still verify and are upgraded on
 * the next successful unlock).
 *
 * The PIN lock is a screen lock, not encryption: data in IndexedDB is not
 * encrypted by it, and the 10^6 possible PINs can be tried offline by anyone
 * who can read the browser profile.
 */

const getWebCrypto = (): Crypto => {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is not available in this environment");
};

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex characters");
    }
    bytes[i] = byte;
  }
  return bytes;
}

/** Generates a cryptographically secure random salt encoded in hex. */
export function generateSalt(byteLength = 16): string {
  const cryptoObj = getWebCrypto();
  const bytes = new Uint8Array(byteLength);
  cryptoObj.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** Validates that a PIN is exactly 6 numeric digits. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Iterations for new PIN hashes (spec H8). */
export const PIN_ITERATIONS = 600_000;
/** Iterations used by PIN hashes created before the hardening (stored as bare hex). */
export const LEGACY_PIN_ITERATIONS = 100_000;
const PIN_HASH_PREFIX = "pbkdf2-sha256";

/**
 * Stored PIN hashes are self-describing: `pbkdf2-sha256$<iterations>$<hex>`.
 * Older hashes are a bare 64-char hex string and used 100,000 iterations.
 * Keeping the iteration count inside the hash string means no settings schema
 * change is needed and every existing caller of verifyPin keeps working.
 */
export function parsePinHash(stored: string): { iterations: number; hex: string } | null {
  if (!stored) return null;
  if (/^[0-9a-f]{64}$/i.test(stored)) return { iterations: LEGACY_PIN_ITERATIONS, hex: stored };
  const [prefix, iter, hex] = stored.split("$");
  const iterations = Number(iter);
  if (
    prefix !== PIN_HASH_PREFIX ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    !hex ||
    !/^[0-9a-f]+$/i.test(hex)
  )
    return null;
  return { iterations, hex };
}

/** True when a stored hash uses fewer iterations than new PINs do. */
export function pinNeedsUpgrade(stored: string): boolean {
  const parsed = parsePinHash(stored);
  return Boolean(parsed && parsed.iterations < PIN_ITERATIONS);
}

/** Raw PBKDF2-SHA-256 derivation of a 6-digit PIN (hex output). */
export async function derivePinHex(
  pin: string,
  saltHex: string,
  iterations: number,
): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN must be exactly 6 digits (0-9)");
  }
  const cryptoObj = getWebCrypto();
  const pinBytes = new TextEncoder().encode(pin);
  const saltBytes = hexToBytes(saltHex);

  const keyMaterial = await cryptoObj.subtle.importKey("raw", pinBytes, { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);

  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Hash a 6-digit PIN for storage. Returns the self-describing format
 * `pbkdf2-sha256$<iterations>$<hex>` (600,000 iterations by default).
 */
export async function hashPin(
  pin: string,
  saltHex: string,
  iterations = PIN_ITERATIONS,
): Promise<string> {
  const hex = await derivePinHex(pin, saltHex, iterations);
  return `${PIN_HASH_PREFIX}$${iterations}$${hex}`;
}

/** Comparison without an early exit on the first differing character. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/*
 * Upgrade on unlock (spec H8). When a PIN is verified against an old
 * 100k-iteration hash, it is remembered in memory for a few seconds so the
 * lock store can re-hash it at 600k right after the unlock succeeds.
 */
interface PendingUpgrade {
  pin: string;
  stored: string;
  until: number;
}
let pendingUpgrade: PendingUpgrade | null = null;
const PENDING_UPGRADE_MS = 10_000;

/** Take (and forget) a verified legacy PIN waiting to be re-hashed, if still fresh. */
export function takePendingPinUpgrade(): { pin: string; stored: string } | null {
  const p = pendingUpgrade;
  pendingUpgrade = null;
  if (!p || p.until < Date.now()) return null;
  return { pin: p.pin, stored: p.stored };
}

/**
 * Verifies a candidate 6-digit PIN against a stored hash (new or legacy format) and salt.
 */
export async function verifyPin(
  pin: string,
  expectedHash: string,
  saltHex: string,
): Promise<boolean> {
  if (!isValidPinFormat(pin) || !expectedHash || !saltHex) {
    return false;
  }
  const parsed = parsePinHash(expectedHash);
  if (!parsed) return false;
  try {
    const computed = await derivePinHex(pin, saltHex, parsed.iterations);
    const ok = sameText(computed, parsed.hex.toLowerCase());
    if (ok && parsed.iterations < PIN_ITERATIONS) {
      pendingUpgrade = { pin, stored: expectedHash, until: Date.now() + PENDING_UPGRADE_MS };
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * New hash + salt for a PIN that was just verified against an older, weaker
 * hash. Returns null when the stored hash is already current.
 */
export async function upgradedPinHash(
  pin: string,
  stored: string,
): Promise<{ pinHash: string; pinSalt: string } | null> {
  if (!pinNeedsUpgrade(stored)) return null;
  const pinSalt = generateSalt(16);
  return { pinHash: await hashPin(pin, pinSalt), pinSalt };
}
