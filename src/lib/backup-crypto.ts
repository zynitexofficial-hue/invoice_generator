/**
 * Passphrase-encrypted backup files (spec H2).
 *
 * Key: PBKDF2-SHA256, 600,000 iterations, random 16-byte salt → AES-GCM 256.
 * Each file gets a fresh salt and a fresh 12-byte IV. AES-GCM authenticates
 * the data, so a wrong passphrase and a damaged file are both detected; we
 * tell them apart as well as we can (a damaged envelope vs. a failed tag).
 *
 * The passphrase is never stored anywhere by this module.
 */

export const ENCRYPTED_BACKUP_FORMAT = "invoice-generator/backup-encrypted";
export const ENCRYPTED_BACKUP_VERSION = 1;
export const BACKUP_KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBackupEnvelope {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: number;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  data: string;
}

export type BackupCryptoErrorCode = "wrong_passphrase" | "corrupted" | "unsupported" | "empty";

export class BackupCryptoError extends Error {
  constructor(
    message: string,
    readonly code: BackupCryptoErrorCode,
  ) {
    super(message);
    this.name = "BackupCryptoError";
  }
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle)
    throw new BackupCryptoError(
      "Encryption isn't available here. Open the app over https (or localhost) in a modern browser.",
      "unsupported",
    );
  return c.subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const s = subtle();
  const material = await s.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return s.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Quick check (no crypto) for an encrypted envelope. */
export function isEncryptedBackup(value: unknown): value is EncryptedBackupEnvelope {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { format?: unknown }).format === ENCRYPTED_BACKUP_FORMAT
  );
}

/** Encrypt a backup's JSON text. Returns the envelope as JSON text. */
export async function encryptBackup(
  json: string,
  passphrase: string,
  iterations = BACKUP_KDF_ITERATIONS,
): Promise<string> {
  if (!passphrase) throw new BackupCryptoError("Enter a passphrase.", "empty");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, iterations);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(json),
  );
  const envelope: EncryptedBackupEnvelope = {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(envelope);
}

const corrupted = () =>
  new BackupCryptoError(
    "This encrypted backup is damaged or incomplete, so it can't be opened.",
    "corrupted",
  );

/** Validate the envelope's shape and decode its binary parts. */
function readEnvelope(value: unknown) {
  if (!isEncryptedBackup(value)) throw corrupted();
  const env = value as Partial<EncryptedBackupEnvelope>;
  if (typeof env.version !== "number" || env.version > ENCRYPTED_BACKUP_VERSION)
    throw new BackupCryptoError(
      "This encrypted backup was made by a newer version of the app. Please update and try again.",
      "unsupported",
    );
  const kdf = env.kdf;
  const cipher = env.cipher;
  if (
    !kdf ||
    kdf.name !== "PBKDF2" ||
    kdf.hash !== "SHA-256" ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < 1 ||
    kdf.iterations > 10_000_000 ||
    typeof kdf.salt !== "string" ||
    !cipher ||
    cipher.name !== "AES-GCM" ||
    typeof cipher.iv !== "string" ||
    typeof env.data !== "string"
  )
    throw corrupted();
  try {
    const salt = base64ToBytes(kdf.salt);
    const iv = base64ToBytes(cipher.iv);
    const data = base64ToBytes(env.data);
    // AES-GCM appends a 16-byte tag; anything shorter can't be valid.
    if (salt.length < 8 || iv.length !== IV_BYTES || data.length < 16) throw corrupted();
    return { salt, iv, data, iterations: kdf.iterations };
  } catch {
    throw corrupted();
  }
}

/**
 * Decrypt an encrypted backup (JSON text of the envelope, or the parsed object).
 * Throws BackupCryptoError with code "wrong_passphrase" or "corrupted".
 *
 * AES-GCM can't tell a wrong key from altered ciphertext: both fail the tag
 * check. A well-formed envelope that fails is reported as a wrong passphrase
 * (the common case), with a hint that the file may also be damaged.
 */
export async function decryptBackup(text: string | unknown, passphrase: string): Promise<string> {
  let value: unknown = text;
  if (typeof text === "string") {
    try {
      value = JSON.parse(text);
    } catch {
      throw corrupted();
    }
  }
  const { salt, iv, data, iterations } = readEnvelope(value);
  if (!passphrase) throw new BackupCryptoError("Enter the backup passphrase.", "empty");
  const key = await deriveKey(passphrase, salt, iterations);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: "AES-GCM", iv }, key, data);
  } catch {
    throw new BackupCryptoError(
      "Wrong passphrase — or the file was changed after it was saved. Check the passphrase and try again.",
      "wrong_passphrase",
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw corrupted();
  }
}

/** Rough passphrase strength for a hint (not a security guarantee). */
export function passphraseStrength(p: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
} {
  if (!p) return { score: 0, label: "" };
  const words = p.trim().split(/\s+/).filter(Boolean).length;
  let classes = 0;
  if (/[a-z]/.test(p)) classes++;
  if (/[A-Z]/.test(p)) classes++;
  if (/\d/.test(p)) classes++;
  if (/[^A-Za-z0-9]/.test(p)) classes++;
  if (p.length < 10) return { score: 0, label: "Too short — use at least 10 characters" };
  if (p.length >= 20 || words >= 4 || (p.length >= 14 && classes >= 3))
    return { score: 3, label: "Strong" };
  if (p.length >= 12 && classes >= 2) return { score: 2, label: "Good" };
  return { score: 1, label: "Weak — add more words or characters" };
}

export const MIN_PASSPHRASE_LENGTH = 10;
