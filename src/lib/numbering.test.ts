import { describe, expect, it } from "vitest";
import {
  businessCode,
  checkGstNumberRules,
  DEFAULT_NUMBER_PATTERN,
  RANDOM_NUMBER_PATTERN,
  patternUsesRandom,
  randomDigits,
  counterKey,
  financialYear,
  formatDocumentNumber,
  gstSeriesUsingRandom,
  isGstNumberedDocType,
  patternUsesSeq,
  unknownTokens,
} from "./numbering";
import { DEFAULT_SETTINGS, DOC_TYPES, settingsSchema } from "./schema";

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
  it("defaults to a consecutive FY series within GST's 16 characters", () => {
    const n = formatDocumentNumber(DEFAULT_NUMBER_PATTERN, { prefix: "INV", date: oct22, seq: 1 });
    expect(n).toBe("INV/26-27/001");
    expect(checkGstNumberRules(n)).toEqual({ tooLong: false, invalidChars: false });
    expect(patternUsesSeq(DEFAULT_NUMBER_PATTERN)).toBe(true);
    expect(patternUsesRandom(DEFAULT_NUMBER_PATTERN)).toBe(false);
  });

  it("builds the random pattern within GST's 16 characters", () => {
    const n = formatDocumentNumber(RANDOM_NUMBER_PATTERN, {
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
    expect(patternUsesRandom(RANDOM_NUMBER_PATTERN)).toBe(true);
  });
});

describe("default prefixes", () => {
  it("gives every series its own prefix so numbers never clash", () => {
    expect(DEFAULT_SETTINGS.numbering.tax_invoice.prefix).toBe("INV");
    expect(DEFAULT_SETTINGS.numbering.invoice.prefix).toBe("BILL");
    const prefixes = DOC_TYPES.map((t) => DEFAULT_SETTINGS.numbering[t].prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("keeps the prefix existing users already saved", () => {
    const stored = settingsSchema.parse({
      numbering: { invoice: { prefix: "INV", pattern: DEFAULT_NUMBER_PATTERN } },
    });
    expect(stored.numbering.invoice.prefix).toBe("INV");
  });
});

describe("gstSeriesUsingRandom", () => {
  it("lists GST series that still use random digits", () => {
    const numbering = {
      ...DEFAULT_SETTINGS.numbering,
      tax_invoice: { prefix: "INV", pattern: RANDOM_NUMBER_PATTERN },
      // Quotations aren't GST documents, so random numbers are fine there.
      proforma: { prefix: "QTN", pattern: RANDOM_NUMBER_PATTERN },
    };
    expect(gstSeriesUsingRandom(numbering)).toEqual(["tax_invoice"]);
    expect(gstSeriesUsingRandom(DEFAULT_SETTINGS.numbering)).toEqual([]);
    expect(isGstNumberedDocType("credit_note")).toBe(true);
    expect(isGstNumberedDocType("invoice")).toBe(false);
  });
});
