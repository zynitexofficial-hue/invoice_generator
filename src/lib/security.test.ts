import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  hexToBytes,
  generateSalt,
  isValidPinFormat,
  hashPin,
  verifyPin,
  LEGACY_PIN_ITERATIONS,
  PIN_ITERATIONS,
  derivePinHex,
  parsePinHash,
  pinNeedsUpgrade,
  takePendingPinUpgrade,
  upgradedPinHash,
} from "./security";

describe("security utils", () => {
  it("converts bytes to hex and back accurately", () => {
    const original = new Uint8Array([0, 15, 16, 255, 128, 42]);
    const hex = bytesToHex(original);
    expect(hex).toBe("000f10ff802a");
    const restored = hexToBytes(hex);
    expect(restored).toEqual(original);
  });

  it("throws on invalid hex string length or characters", () => {
    expect(() => hexToBytes("123")).toThrow("Invalid hex string length");
    expect(() => hexToBytes("12zz")).toThrow("Invalid hex characters");
  });

  it("generates a random salt with the specified length", () => {
    const salt1 = generateSalt(16);
    const salt2 = generateSalt(16);
    expect(salt1.length).toBe(32); // 16 bytes = 32 hex chars
    expect(salt2.length).toBe(32);
    expect(salt1).not.toBe(salt2);
  });

  it("validates 6-digit PIN format", () => {
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("000000")).toBe(true);
    expect(isValidPinFormat("999999")).toBe(true);
    expect(isValidPinFormat("12345")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12345a")).toBe(false);
    expect(isValidPinFormat("abcdef")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });

  it("hashes and verifies a PIN correctly", async () => {
    const pin = "482910";
    const salt = generateSalt(16);
    const hash = await hashPin(pin, salt);

    // Self-describing: algorithm, iterations, 256-bit hex digest.
    expect(hash).toMatch(/^pbkdf2-sha256\$600000\$[0-9a-f]{64}$/);

    // Correct PIN matches
    const isCorrect = await verifyPin(pin, hash, salt);
    expect(isCorrect).toBe(true);

    // Wrong PIN does not match
    const isWrong = await verifyPin("482911", hash, salt);
    expect(isWrong).toBe(false);

    // Invalid PIN format rejected
    const isInvalid = await verifyPin("123", hash, salt);
    expect(isInvalid).toBe(false);
  });

  it("produces deterministic hashes for the same PIN and salt", async () => {
    const salt = generateSalt(16);
    const hash1 = await hashPin("112233", salt);
    const hash2 = await hashPin("112233", salt);
    expect(hash1).toBe(hash2);
  });

  it("verifies legacy 100k hashes (bare hex) and marks them for upgrade", async () => {
    const salt = generateSalt(16);
    const legacy = await derivePinHex("246810", salt, LEGACY_PIN_ITERATIONS);
    expect(parsePinHash(legacy)).toEqual({ iterations: 100_000, hex: legacy });
    expect(pinNeedsUpgrade(legacy)).toBe(true);

    takePendingPinUpgrade(); // clear anything left over
    expect(await verifyPin("246810", legacy, salt)).toBe(true);
    expect(takePendingPinUpgrade()).toEqual({ pin: "246810", stored: legacy });
    expect(takePendingPinUpgrade()).toBeNull();

    // A wrong PIN never queues an upgrade.
    expect(await verifyPin("000000", legacy, salt)).toBe(false);
    expect(takePendingPinUpgrade()).toBeNull();

    const next = await upgradedPinHash("246810", legacy);
    expect(next).not.toBeNull();
    expect(pinNeedsUpgrade(next!.pinHash)).toBe(false);
    expect(parsePinHash(next!.pinHash)?.iterations).toBe(PIN_ITERATIONS);
    expect(await verifyPin("246810", next!.pinHash, next!.pinSalt)).toBe(true);
    // Current hashes don't queue an upgrade.
    expect(takePendingPinUpgrade()).toBeNull();
    expect(await upgradedPinHash("246810", next!.pinHash)).toBeNull();
  });

  it("rejects malformed stored hashes", async () => {
    const salt = generateSalt(16);
    expect(parsePinHash("")).toBeNull();
    expect(parsePinHash("md5$1$abcd")).toBeNull();
    expect(parsePinHash("pbkdf2-sha256$abc$abcd")).toBeNull();
    expect(await verifyPin("123456", "garbage", salt)).toBe(false);
  });
});
