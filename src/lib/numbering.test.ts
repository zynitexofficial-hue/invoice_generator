import { describe, expect, it } from "vitest";
import {
  businessCode,
  checkGstNumberRules,
  DEFAULT_NUMBER_PATTERN,
  patternUsesRandom,
  randomDigits,
  counterKey,
  financialYear,
  formatDocumentNumber,
  patternUsesSeq,
  unknownTokens,
} from "./numbering";

const oct22 = new Date(2026, 9, 22, 14, 30, 52);

describe("formatDocumentNumber", () => {
  it("expands date and time tokens", () => {
    expect(
      formatDocumentNumber("{PREFIX}-{YY}{MM}{DD}-{HH}{mm}", { prefix: "INV", date: oct22 }),
    ).toBe("INV-261022-1430");
    expect(
      formatDocumentNumber("{PREFIX}-{YYYY}{MM}{DD}-{HH}{mm}{ss}", { prefix: "INV", date: oct22 }),
    ).toBe("INV-20261022-143052");
  });

  it("expands FY and padded sequence tokens", () => {
    expect(
      formatDocumentNumber("{PREFIX}/{FY}/{SEQ:3}", { prefix: "INV", date: oct22, seq: 7 }),
    ).toBe("INV/26-27/007");
    expect(formatDocumentNumber("{SEQ}", { prefix: "", date: oct22, seq: 42 })).toBe("42");
  });

  it("leaves unknown tokens untouched and reports them", () => {
    expect(formatDocumentNumber("{PREFIX}{FOO}", { prefix: "A", date: oct22 })).toBe("A{FOO}");
    expect(unknownTokens("{PREFIX}{FOO}{SEQ:2}")).toEqual(["{FOO}"]);
  });
});

describe("financialYear", () => {
  it("switches on 1 April", () => {
    expect(financialYear(new Date(2026, 2, 31)).label).toBe("25-26");
    expect(financialYear(new Date(2026, 3, 1)).label).toBe("26-27");
    expect(financialYear(new Date(2099, 11, 31)).label).toBe("99-00");
  });
});

describe("counterKey", () => {
  it("scopes counters by FY, year, or document type", () => {
    expect(counterKey("tax_invoice", "{PREFIX}/{FY}/{SEQ}", oct22)).toBe("tax_invoice:fy26-27");
    expect(counterKey("tax_invoice", "{PREFIX}{YYYY}{SEQ}", oct22)).toBe("tax_invoice:y2026");
    expect(counterKey("proforma", "{PREFIX}{SEQ:4}", oct22)).toBe("proforma");
  });

  it("detects sequence usage", () => {
    expect(patternUsesSeq("{PREFIX}-{SEQ:3}")).toBe(true);
    expect(patternUsesSeq("{PREFIX}-{HH}")).toBe(false);
  });
});

describe("checkGstNumberRules", () => {
  it("flags long numbers and invalid characters", () => {
    expect(checkGstNumberRules("INV-261022-1430")).toEqual({ tooLong: false, invalidChars: false });
    expect(checkGstNumberRules("INV-20261022-143052").tooLong).toBe(true);
    expect(checkGstNumberRules("INV#1").invalidChars).toBe(true);
  });
});

describe("business code and random tokens", () => {
  const fixed = () => "4827";
  it("builds the default pattern within GST's 16 characters", () => {
    const n = formatDocumentNumber(DEFAULT_NUMBER_PATTERN, {
      prefix: "INV",
      date: oct22,
      business: "Zynitex",
      random: fixed,
    });
    expect(n).toBe("ZYNI-261022-4827");
    expect(checkGstNumberRules(n)).toEqual({ tooLong: false, invalidChars: false });
  });

  it("derives a business code from the name, with a fallback", () => {
    expect(businessCode("Zynitex Studio")).toBe("ZYNI");
    expect(businessCode("A&B Traders")).toBe("ABTR");
    expect(businessCode("  ")).toBe("INV");
  });

  it("produces random digits of the requested length", () => {
    expect(randomDigits(4)).toMatch(/^\d{4}$/);
    expect(formatDocumentNumber("{RAND:6}", { prefix: "", date: oct22 })).toMatch(/^\d{6}$/);
    expect(patternUsesRandom(DEFAULT_NUMBER_PATTERN)).toBe(true);
  });
});
