/**
 * Security and cryptographic helpers for user panel PIN lock.
 *
 * All operations use the standard Web Crypto API (`crypto.subtle`) available in
 * both modern browsers and Node.js environments.
 * The 6-digit PIN is never stored in plain text — it is salted with a random 16-byte
 * cryptographic salt and derived using PBKDF2 with SHA-256 (100,000 iterations).
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

/**
 * Derives a PBKDF2 SHA-256 hash from a 6-digit PIN and a hex-encoded salt.
 */
export async function hashPin(pin: string, saltHex: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN must be exactly 6 digits (0-9)");
  }
  const cryptoObj = getWebCrypto();
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  const saltBytes = hexToBytes(saltHex);

  const keyMaterial = await cryptoObj.subtle.importKey(
    "raw",
    pinBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Verifies a candidate 6-digit PIN against an expected PBKDF2 hash and salt.
 */
export async function verifyPin(
  pin: string,
  expectedHash: string,
  saltHex: string,
): Promise<boolean> {
  if (!isValidPinFormat(pin) || !expectedHash || !saltHex) {
    return false;
  }
  try {
    const computed = await hashPin(pin, saltHex);
    return computed === expectedHash;
  } catch {
    return false;
  }
}
