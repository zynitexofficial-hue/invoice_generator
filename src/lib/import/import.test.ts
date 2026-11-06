import { beforeEach, describe, expect, it, vi } from "vitest";
import { gstinCheckChar } from "@/lib/gst/gstin";
import { DEFAULT_SETTINGS, type Customer } from "@/lib/schema";
import { getDb } from "@/db/db";
import { applyImport } from "./apply";
import {
  decodeCsvBytes,
  detectDelimiter,
  ImportFileError,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  parseCsvFile,
} from "./csv-parse";
import { missingRequired, suggestMapping, templateRows } from "./fields";
import { buildPlan, countPlan, errorReportCsv, importableCount, templateCsv } from "./plan";
import {
  mapRow,
  parseAmount,
  parseBool,
  parseImportDate,
  parseRate,
  resolveState,
  validateCustomer,
  validateExpense,
  validateItem,
  validateRows,
} from "./validate";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const enc = (s: string) => new TextEncoder().encode(s);
const ctx = { settings: DEFAULT_SETTINGS, today: "2026-11-05" };
const goodGstin = (() => {
  const body = "27AAPFU0939F1Z";
  return body + gstinCheckChar(body);
})();

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded delimiters and newlines", () => {
    const { rows } = parseCsv('a,b,c\r\n"x, y","He said ""hi""","line1\nline2"\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'He said "hi"', "line1\nline2"],
    ]);
  });
  it("copes with LF, CR, missing final newline and blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n3,4").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parseCsv("a,b\r1,2\r").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("keeps empty cells and drops rows that are only delimiters", () => {
    expect(parseCsv("a,b,c\n1,,3\n,,\n").rows).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
  it("flags an unterminated quote", () => {
    expect(parseCsv('a,b\n"oops,2').unterminatedQuote).toBe(true);
  });
  it("supports other delimiters", () => {
    expect(parseCsv("a;b\n1;2", ";").rows[1]).toEqual(["1", "2"]);
  });
});

describe("detectDelimiter and decoding", () => {
  it("detects comma, semicolon, tab and pipe", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
    expect(detectDelimiter("name\nAsha")).toBe(",");
    expect(detectDelimiter("sep=;\na;b\n1;2")).toBe(";");
  });
  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('"a;b",c\n"1;2",3')).toBe(",");
  });
  it("strips a UTF-8 BOM and reads UTF-16", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("name\nAsha")]);
    expect(decodeCsvBytes(bom)).toEqual({ text: "name\nAsha", encoding: "utf-8-bom" });
    const utf16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
    expect(decodeCsvBytes(utf16)).toEqual({ text: "ab", encoding: "utf-16le" });
  });
  it("falls back to Windows-1252 for non-UTF-8 bytes", () => {
    const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]); // Müller
    expect(decodeCsvBytes(bytes)).toEqual({ text: "Müller", encoding: "windows-1252" });
  });
});

describe("parseCsvFile", () => {
  it("returns headers, cleaned rows and pads ragged rows", () => {
    const f = parseCsvFile(enc("Name,Name,\nAsha,x\n'=SUM(1),y,z,extra"));
    expect(f.headers).toEqual(["Name", "Name (2)", "Column 3"]);
    expect(f.rows).toEqual([
      ["Asha", "x", ""],
      ["=SUM(1)", "y", "z"],
    ]);
    expect(f.raggedRows).toBe(2);
  });
  it("rejects empty, header-only, too big and too long files with plain messages", () => {
    expect(() => parseCsvFile(new Uint8Array())).toThrow(ImportFileError);
    expect(() => parseCsvFile(enc("a,b\n"))).toThrow(/no data rows/);
    expect(() => parseCsvFile(new Uint8Array(MAX_IMPORT_BYTES + 1))).toThrow(/limit is 5 MB/);
    const many = "a\n" + "x\n".repeat(MAX_IMPORT_ROWS + 1);
    expect(() => parseCsvFile(enc(many))).toThrow(/limit is 5,000/);
    expect(parseCsvFile(enc("a\n" + "x\n".repeat(MAX_IMPORT_ROWS))).rows).toHaveLength(
      MAX_IMPORT_ROWS,
    );
  });
});

describe("column mapping", () => {
  it("suggests fields from common header names", () => {
    const m = suggestMapping("customers", [
      "Party Name",
      "GST No",
      "Mobile",
      "E-mail",
      "Address",
      "State",
      "PIN",
    ]);
    expect(m.name).toBe(0);
    expect(m.gstin).toBe(1);
    expect(m.phone).toBe(2);
    expect(m.email).toBe(3);
    expect(m.billingAddress).toBe(4);
    expect(m.state).toBe(5);
    expect(m.pincode).toBe(6);
    expect(m.company).toBe(-1);
  });
  it("uses a column once and reports missing required fields", () => {
    const m = suggestMapping("expenses", ["Date", "Total", "Supplier", "GST %"]);
    expect(m).toMatchObject({ date: 0, amount: 1, vendorName: 2, gstRate: 3 });
    expect(missingRequired("expenses", { ...m, amount: -1 }).map((f) => f.key)).toEqual(["amount"]);
  });
  it("matches its own template headers for every type", () => {
    for (const e of ["customers", "items", "expenses"] as const) {
      const { headers } = templateRows(e);
      const m = suggestMapping(e, headers);
      expect(Object.values(m).every((i) => i >= 0)).toBe(true);
      expect(new Set(Object.values(m)).size).toBe(headers.length);
    }
  });
});

describe("cell parsers", () => {
  it("dates", () => {
    expect(parseImportDate("2026-10-05")).toBe("2026-10-05");
    expect(parseImportDate("5/10/2026")).toBe("2026-10-05");
    expect(parseImportDate("05-10-26")).toBe("2026-10-05");
    expect(parseImportDate("5 Oct 2026")).toBe("2026-10-05");
    expect(parseImportDate("29/02/2028")).toBe("2028-02-29");
    expect(parseImportDate("29/02/2027")).toBeUndefined();
    expect(parseImportDate("31/04/2026")).toBeUndefined();
    expect(parseImportDate("soon")).toBeUndefined();
  });
  it("amounts, rates, yes/no and states", () => {
    expect(parseAmount("₹ 1,23,456.50")).toBe("123456.5");
    expect(parseAmount("Rs. 99")).toBe("99");
    expect(parseAmount("-5")).toBeUndefined();
    expect(parseAmount("abc")).toBeUndefined();
    expect(parseRate("18%")).toBe("18");
    expect(parseRate("150")).toBeUndefined();
    expect(parseBool("Yes")).toBe(true);
    expect(parseBool("N")).toBe(false);
    expect(parseBool("maybe")).toBeUndefined();
    expect(resolveState("Maharashtra")).toBe("27");
    expect(resolveState("7")).toBe("07");
    expect(resolveState("27 - Maharashtra")).toBe("27");
    expect(resolveState("Atlantis")).toBeUndefined();
  });
});

describe("validateCustomer", () => {
  it("accepts a good row and derives the state from the GSTIN", () => {
    const r = validateCustomer(
      { name: "Asha", gstin: goodGstin.toLowerCase(), email: "a@b.co" },
      2,
    );
    expect(r.errors).toEqual([]);
    expect(r.value?.gstin).toBe(goodGstin);
    expect(r.value?.stateCode).toBe("27");
    expect(r.value?.country).toBe("India");
  });
  it("reports GSTIN, email, PIN and name problems", () => {
    const r = validateCustomer({ gstin: "27AAPFU0939F1Z0", email: "nope", pincode: "123" }, 5);
    expect(r.value).toBeUndefined();
    expect(r.errors.join(" ")).toMatch(/Name is required/);
    expect(r.errors.join(" ")).toMatch(/GSTIN/);
    expect(r.errors.join(" ")).toMatch(/Email/);
    expect(r.errors.join(" ")).toMatch(/PIN code/);
  });
  it("uses the company as the name when the name is blank", () => {
    const r = validateCustomer({ company: "Rao & Sons" }, 2);
    expect(r.value?.name).toBe("Rao & Sons");
    expect(r.warnings).toHaveLength(1);
  });
  it("warns when the state disagrees with the GSTIN", () => {
    const r = validateCustomer({ name: "A", gstin: goodGstin, state: "Delhi" }, 2);
    expect(r.value?.stateCode).toBe("27");
    expect(r.warnings.join(" ")).toMatch(/doesn't match/);
  });
  it("enforces length limits from the schema", () => {
    expect(validateCustomer({ name: "x".repeat(200) }, 2).errors.length).toBeGreaterThan(0);
  });
});

describe("validateItem", () => {
  it("accepts and normalises", () => {
    const r = validateItem(
      {
        name: "Paper",
        hsnSac: "4802",
        price: "₹1,200.50",
        gstRate: "12%",
        priceIncludesGst: "yes",
      },
      2,
      ctx,
    );
    expect(r.value).toMatchObject({ price: "1200.5", gstRate: "12", priceIncludesGst: true });
    expect(r.warnings.join(" ")).toMatch(/standard GST slab/); // 12% is gone after 22 Sep 2025
  });
  it("flags bad numbers", () => {
    const r = validateItem({ name: "", price: "lots", gstRate: "x" }, 2, ctx);
    expect(r.errors).toHaveLength(3);
  });
});

describe("validateExpense", () => {
  it("accepts a typical row and works out GST mode and payment", () => {
    const r = validateExpense(
      {
        date: "05/10/2026",
        amount: "11,800",
        vendorName: "Sunrise",
        vendorGstin: goodGstin,
        category: "Rent",
        gstRate: "18",
      },
      2,
      {
        ...ctx,
        settings: {
          ...DEFAULT_SETTINGS,
          profile: { ...DEFAULT_SETTINGS.profile, stateCode: "29" },
        },
      },
    );
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({
      date: "2026-10-05",
      amount: "11800",
      gstMode: "inter",
      itcEligible: true,
      paymentStatus: "paid",
      paymentDate: "2026-10-05",
    });
  });
  it("reports missing and invalid date / amount", () => {
    expect(validateExpense({}, 2, ctx).errors).toEqual([
      "Date is required.",
      "Amount is required.",
    ]);
    const r = validateExpense({ date: "31/02/2026", amount: "0" }, 2, ctx);
    expect(r.errors.join(" ")).toMatch(/isn't recognised/);
    const z = validateExpense({ date: "2026-10-05", amount: "0" }, 2, ctx);
    expect(z.errors).toEqual(["Amount must be more than zero."]);
  });
  it("unpaid has no payment date; ITC without GST is dropped with a warning", () => {
    const r = validateExpense(
      {
        date: "2026-10-05",
        amount: "100",
        vendorName: "V",
        paymentStatus: "Unpaid",
        itcEligible: "yes",
      },
      2,
      ctx,
    );
    expect(r.value?.paymentDate).toBe("");
    expect(r.value?.itcEligible).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/ITC/);
  });
});

describe("plan, dedupe and reports", () => {
  const existingCustomer = {
    id: "c1",
    name: "Asha Mehta",
    company: "",
    email: "",
    phone: "",
    billingAddress: "",
    shippingAddress: "",
    city: "",
    pincode: "",
    stateCode: "",
    country: "India",
    gstin: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
  } satisfies Customer;
  const data = { customers: [existingCustomer], items: [], expenses: [] };

  const headers = ["Name", "GSTIN"];
  const rows = [
    ["Asha  MEHTA", ""], // duplicate of saved (name, case/space-insensitive)
    ["New Co", goodGstin], // new
    ["Other Name", goodGstin], // same GSTIN earlier in file
    ["", ""], // error
  ];
  const mapping = suggestMapping("customers", headers);
  const plan = buildPlan("customers", validateRows("customers", rows, mapping, ctx), data);

  it("classifies rows", () => {
    expect(plan.map((p) => p.status)).toEqual(["duplicate", "new", "duplicate_in_file", "error"]);
    expect(plan[0]?.matchId).toBe("c1");
    expect(countPlan(plan)).toEqual({
      total: 4,
      new: 1,
      duplicate: 1,
      duplicateInFile: 1,
      error: 1,
    });
    expect(importableCount(plan, "skip")).toBe(1);
    expect(importableCount(plan, "merge")).toBe(2);
  });

  it("matches an existing customer by GSTIN", () => {
    const withGstin = {
      ...data,
      customers: [{ ...existingCustomer, name: "Different", gstin: goodGstin }],
    };
    const p = buildPlan(
      "customers",
      validateRows("customers", [["Whatever", goodGstin]], mapping, ctx),
      withGstin,
    );
    expect(p[0]?.status).toBe("duplicate");
  });

  it("dedupes expenses by date, amount and vendor", () => {
    const m = suggestMapping("expenses", ["Date", "Amount", "Vendor"]);
    const p = buildPlan(
      "expenses",
      validateRows(
        "expenses",
        [
          ["2026-10-05", "100", "Cafe"],
          ["05/10/2026", "100.00", " cafe "],
          ["2026-10-05", "100", "Other"],
        ],
        m,
        ctx,
      ),
      { customers: [], items: [], expenses: [] },
    );
    expect(p.map((x) => x.status)).toEqual(["new", "duplicate_in_file", "new"]);
  });

  it("dedupes items by name and HSN", () => {
    const m = suggestMapping("items", ["Item", "HSN"]);
    const p = buildPlan(
      "items",
      validateRows(
        "items",
        [
          ["Pen", "9608"],
          ["pen", "9608"],
          ["Pen", "1111"],
        ],
        m,
        ctx,
      ),
      data,
    );
    expect(p.map((x) => x.status)).toEqual(["new", "duplicate_in_file", "new"]);
  });

  it("writes an error report and templates as CSV", () => {
    const csv = errorReportCsv(headers, rows, plan);
    expect(csv.split("\r\n")[0]).toBe("Line,Problems,Name,GSTIN");
    expect(csv).toMatch(/^5,Name is required\.,,$/m);
    expect(templateCsv("items").split("\r\n")[0]).toContain("HSN / SAC");
  });
});

describe("applyImport", () => {
  beforeEach(async () => {
    const db = getDb();
    await Promise.all(db.tables.map((t) => t.clear()));
    memory.clear();
  });

  const run = async (policy: "skip" | "merge" | "add", csv: string) => {
    const f = parseCsvFile(enc(csv));
    const mapping = suggestMapping("customers", f.headers);
    const existing = { customers: await getDb().customers.toArray(), items: [], expenses: [] };
    const plan = buildPlan("customers", validateRows("customers", f.rows, mapping, ctx), existing);
    return applyImport("customers", plan, policy, "c.csv");
  };

  it("adds valid rows only, skips errors, and logs one import audit entry", async () => {
    const s = await run("skip", `Name,Email\nAsha,a@b.co\n,x\nBharat,bad`);
    expect(s).toEqual({ created: 1, merged: 0, skipped: 0, failed: 2 });
    expect(await getDb().customers.count()).toBe(1);
    const log = await getDb().auditLog.toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entity: "customer", action: "import" });
    expect(log[0]?.summary).toMatch(/Imported 1 customer from c\.csv/);
  });

  it("skip leaves duplicates alone; merge fills them; add creates another", async () => {
    await run("skip", `Name,Phone\nAsha,111`);
    expect((await run("skip", `Name,Phone\nAsha,222`)).skipped).toBe(1);
    expect((await getDb().customers.toArray())[0]?.phone).toBe("111");

    const merged = await run("merge", `Name,Phone,City\nAsha,222,Pune`);
    expect(merged.merged).toBe(1);
    const [c] = await getDb().customers.toArray();
    expect(c).toMatchObject({ phone: "222", city: "Pune", name: "Asha" });
    expect(await getDb().customers.count()).toBe(1);

    expect((await run("add", `Name\nAsha`)).created).toBe(1);
    expect(await getDb().customers.count()).toBe(2);
  });

  it("imports expenses with computed summaries", async () => {
    const f = parseCsvFile(enc("Date,Amount,Vendor,GST %\n2026-10-05,11800,Landlord,18"));
    const mapping = suggestMapping("expenses", f.headers);
    const plan = buildPlan("expenses", validateRows("expenses", f.rows, mapping, ctx), {
      customers: [],
      items: [],
      expenses: [],
    });
    expect((await applyImport("expenses", plan, "skip", "e.csv")).created).toBe(1);
    const [e] = await getDb().expenses.toArray();
    expect(e?.summary.taxable).toBe("10000.00");
    expect(e?.summary.total).toBe("11800.00");
  });
});

describe("mapRow", () => {
  it("reads unmapped fields as empty", () => {
    expect(mapRow("items", ["Pen", "5"], { name: 0, price: 1, hsnSac: -1 })).toMatchObject({
      name: "Pen",
      price: "5",
      hsnSac: "",
    });
  });
});
