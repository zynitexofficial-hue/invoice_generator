import { describe, expect, it } from "vitest";
import {
  BACKUP_KDF_ITERATIONS,
  BackupCryptoError,
  ENCRYPTED_BACKUP_FORMAT,
  base64ToBytes,
  bytesToBase64,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  passphraseStrength,
} from "./backup-crypto";

const PLAIN = JSON.stringify({ format: "invoice-generator/backup", hello: "नमस्ते ₹100" });

describe("backup encryption", () => {
  it("round-trips with the default 600k-iteration envelope", async () => {
    const text = await encryptBackup(PLAIN, "correct horse battery staple");
    const env = JSON.parse(text);
    expect(env.format).toBe(ENCRYPTED_BACKUP_FORMAT);
    expect(env.version).toBe(1);
    expect(env.kdf).toMatchObject({ name: "PBKDF2", hash: "SHA-256", iterations: 600_000 });
    expect(BACKUP_KDF_ITERATIONS).toBe(600_000);
    expect(base64ToBytes(env.kdf.salt)).toHaveLength(16);
    expect(env.cipher.name).toBe("AES-GCM");
    expect(base64ToBytes(env.cipher.iv)).toHaveLength(12);
    expect(text).not.toContain("hello");
    expect(isEncryptedBackup(env)).toBe(true);
    expect(await decryptBackup(text, "correct horse battery staple")).toBe(PLAIN);
  });

  it("uses a fresh salt and IV for every file", async () => {
    const a = JSON.parse(await encryptBackup(PLAIN, "passphrase-123", 1000));
    const b = JSON.parse(await encryptBackup(PLAIN, "passphrase-123", 1000));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("reports a wrong passphrase clearly", async () => {
    const text = await encryptBackup(PLAIN, "right passphrase", 1000);
    const error = await decryptBackup(text, "wrong passphrase").catch((e) => e);
    expect(error).toBeInstanceOf(BackupCryptoError);
    expect(error.code).toBe("wrong_passphrase");
    expect(error.message).toMatch(/wrong passphrase/i);
  });

  it("detects tampered data", async () => {
    const env = JSON.parse(await encryptBackup(PLAIN, "right passphrase", 1000));
    const bytes = base64ToBytes(env.data);
    bytes[0] ^= 0xff;
    const tampered = JSON.stringify({ ...env, data: bytesToBase64(bytes) });
    const error = await decryptBackup(tampered, "right passphrase").catch((e) => e);
    expect(error).toBeInstanceOf(BackupCryptoError);
    expect(error.code).toBe("wrong_passphrase");
  });

  it("reports a damaged envelope as corrupted", async () => {
    const env = JSON.parse(await encryptBackup(PLAIN, "right passphrase", 1000));
    for (const broken of [
      "{not json",
      JSON.stringify({ ...env, cipher: { name: "AES-GCM", iv: "AAAA" } }),
      JSON.stringify({ ...env, data: "%%%" }),
      JSON.stringify({ ...env, kdf: { ...env.kdf, hash: "MD5" } }),
    ]) {
      const error = await decryptBackup(broken, "right passphrase").catch((e) => e);
      expect(error).toBeInstanceOf(BackupCryptoError);
      expect(error.code).toBe("corrupted");
    }
  });

  it("refuses an envelope from a newer version", async () => {
    const env = JSON.parse(await encryptBackup(PLAIN, "right passphrase", 1000));
    const error = await decryptBackup(JSON.stringify({ ...env, version: 2 }), "x").catch((e) => e);
    expect(error.code).toBe("unsupported");
  });

  it("rates passphrases", () => {
    expect(passphraseStrength("").score).toBe(0);
    expect(passphraseStrength("short").score).toBe(0);
    expect(passphraseStrength("abcdefghij").score).toBe(1);
    expect(passphraseStrength("Abcdefgh1234").score).toBe(2);
    expect(passphraseStrength("blue tiger river lamp").score).toBe(3);
  });
});
