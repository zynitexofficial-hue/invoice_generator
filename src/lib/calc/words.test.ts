import { describe, expect, it } from "vitest";
import { amountInWords, integerToWords } from "./words";

describe("integerToWords", () => {
  it("handles small numbers and hyphenation", () => {
    expect(integerToWords(BigInt(0), "indian")).toBe("Zero");
    expect(integerToWords(BigInt(7), "indian")).toBe("Seven");
    expect(integerToWords(BigInt(19), "indian")).toBe("Nineteen");
    expect(integerToWords(BigInt(42), "indian")).toBe("Forty-Two");
    expect(integerToWords(BigInt(100), "indian")).toBe("One Hundred");
    expect(integerToWords(BigInt(868), "indian")).toBe("Eight Hundred Sixty-Eight");
  });

  it("uses lakh and crore in the Indian system", () => {
    expect(integerToWords(BigInt(22868), "indian")).toBe(
      "Twenty-Two Thousand Eight Hundred Sixty-Eight",
    );
    expect(integerToWords(BigInt(100000), "indian")).toBe("One Lakh");
    expect(integerToWords(BigInt(1234567), "indian")).toBe(
      "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven",
    );
    expect(integerToWords(BigInt(10000000), "indian")).toBe("One Crore");
    expect(integerToWords(BigInt(123456789012), "indian")).toBe(
      "Twelve Thousand Three Hundred Forty-Five Crore Sixty-Seven Lakh Eighty-Nine Thousand Twelve",
    );
  });

  it("uses million and billion in the international system", () => {
    expect(integerToWords(BigInt(1234567), "international")).toBe(
      "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven",
    );
    expect(integerToWords(BigInt(2000000000), "international")).toBe("Two Billion");
  });
});

describe("amountInWords", () => {
  it("formats INR with paise", () => {
    expect(amountInWords("22868.00", "INR")).toBe(
      "Indian Rupees Twenty-Two Thousand Eight Hundred Sixty-Eight Only",
    );
    expect(amountInWords("100.50", "INR")).toBe("Indian Rupees One Hundred and Paise Fifty Only");
  });

  it("formats other currencies", () => {
    expect(amountInWords("1200.50", "USD")).toBe(
      "US Dollars One Thousand Two Hundred and Cents Fifty Only",
    );
    expect(amountInWords("1000", "JPY")).toBe("Japanese Yen One Thousand Only");
    expect(amountInWords("1.250", "KWD")).toBe(
      "Kuwaiti Dinars One and Fils Two Hundred Fifty Only",
    );
  });

  it("handles zero", () => {
    expect(amountInWords("0", "INR")).toBe("Indian Rupees Zero Only");
  });
});
