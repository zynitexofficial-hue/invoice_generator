import type { ItemType, LineItem } from "@/lib/schema";

/** GST Unit Quantity Codes offered in the editor (GSTR-1 HSN summary). */
export const UQC_OPTIONS: { value: string; label: string }[] = [
  { value: "NOS", label: "NOS – Numbers" },
  { value: "PCS", label: "PCS – Pieces" },
  { value: "KGS", label: "KGS – Kilograms" },
  { value: "GMS", label: "GMS – Grams" },
  { value: "LTR", label: "LTR – Litres" },
  { value: "MLT", label: "MLT – Millilitres" },
  { value: "MTR", label: "MTR – Metres" },
  { value: "SQF", label: "SQF – Square feet" },
  { value: "SQM", label: "SQM – Square metres" },
  { value: "BOX", label: "BOX – Box" },
  { value: "SET", label: "SET – Sets" },
  { value: "PAC", label: "PAC – Packs" },
  { value: "DOZ", label: "DOZ – Dozens" },
  { value: "TON", label: "TON – Tonnes" },
  { value: "UNT", label: "UNT – Units" },
  { value: "OTH", label: "OTH – Others (services, hours…)" },
];

const UNIT_TO_UQC: Record<string, string> = {
  pcs: "PCS",
  pc: "PCS",
  piece: "PCS",
  pieces: "PCS",
  nos: "NOS",
  no: "NOS",
  kg: "KGS",
  kgs: "KGS",
  g: "GMS",
  gm: "GMS",
  gms: "GMS",
  ltr: "LTR",
  l: "LTR",
  litre: "LTR",
  ml: "MLT",
  m: "MTR",
  mtr: "MTR",
  "sq.ft": "SQF",
  sqft: "SQF",
  "sq.m": "SQM",
  sqm: "SQM",
  box: "BOX",
  set: "SET",
  pack: "PAC",
  dozen: "DOZ",
  hr: "OTH",
  hrs: "OTH",
  hour: "OTH",
  hours: "OTH",
  day: "OTH",
  days: "OTH",
  month: "OTH",
  months: "OTH",
  job: "OTH",
};

/** UQC for a free-text unit ("kg" → "KGS"); "" when there is no obvious match. */
export function uqcForUnit(unit: string): string {
  return UNIT_TO_UQC[unit.trim().toLowerCase()] ?? "";
}

/** SAC codes (services) start with 99; anything else is an HSN code for goods. */
export function itemTypeForHsn(hsn: string): ItemType | null {
  const code = hsn.trim();
  if (code.length < 2) return null;
  return code.startsWith("99") ? "services" : "goods";
}

/**
 * Keep a line's Goods/Services and UQC in step with its HSN and unit. A value
 * the user picked by hand (one that no longer matches the automatic choice
 * for the previous HSN/unit) is left alone.
 */
export function withAutoCodes(prev: LineItem, next: LineItem): LineItem {
  let result = next;
  if (next.hsnSac !== prev.hsnSac) {
    const auto = itemTypeForHsn(next.hsnSac);
    const prevAuto = itemTypeForHsn(prev.hsnSac) ?? "goods";
    if (auto && prev.itemType === prevAuto) result = { ...result, itemType: auto };
  }
  if (next.unit !== prev.unit) {
    const prevAuto = uqcForUnit(prev.unit);
    if (prev.uqc === "" || prev.uqc === prevAuto)
      result = { ...result, uqc: uqcForUnit(next.unit) };
  }
  return result;
}

/** Goods/Services and UQC for a freshly filled line (e.g. picked from the catalog). */
export function withFreshCodes(line: LineItem): LineItem {
  return withAutoCodes({ ...line, hsnSac: "", unit: "", itemType: "goods", uqc: "" }, line);
}
