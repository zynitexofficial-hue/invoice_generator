import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  hexToBytes,
  generateSalt,
  isValidPinFormat,
  hashPin,
  verifyPin,
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

    expect(hash).toHaveLength(64); // 256 bits = 32 bytes = 64 hex chars
    expect(typeof hash).toBe("string");

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
});
