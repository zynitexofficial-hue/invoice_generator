import type { LineItem } from "@/lib/schema";

/**
 * GST Unit Quantity Codes (UQC) as accepted in GSTR-1 Table 12.
 * Verify on portal — the list is maintained by GSTN.
 */
export const UQC_CODES = [
  { code: "BAG", label: "Bags" },
  { code: "BAL", label: "Bale" },
  { code: "BDL", label: "Bundles" },
  { code: "BKL", label: "Buckles" },
  { code: "BOU", label: "Billion of units" },
  { code: "BOX", label: "Box" },
  { code: "BTL", label: "Bottles" },
  { code: "BUN", label: "Bunches" },
  { code: "CAN", label: "Cans" },
  { code: "CBM", label: "Cubic meters" },
  { code: "CCM", label: "Cubic centimeters" },
  { code: "CMS", label: "Centimeters" },
  { code: "CTN", label: "Cartons" },
  { code: "DOZ", label: "Dozens" },
  { code: "DRM", label: "Drums" },
  { code: "GGK", label: "Great gross" },
  { code: "GMS", label: "Grammes" },
  { code: "GRS", label: "Gross" },
  { code: "GYD", label: "Gross yards" },
  { code: "KGS", label: "Kilograms" },
  { code: "KLR", label: "Kilolitre" },
  { code: "KME", label: "Kilometre" },
  { code: "LTR", label: "Litres" },
  { code: "MLT", label: "Millilitre" },
  { code: "MTR", label: "Meters" },
  { code: "MTS", label: "Metric ton" },
  { code: "NOS", label: "Numbers" },
  { code: "OTH", label: "Others" },
  { code: "PAC", label: "Packs" },
  { code: "PCS", label: "Pieces" },
  { code: "PRS", label: "Pairs" },
  { code: "QTL", label: "Quintal" },
  { code: "ROL", label: "Rolls" },
  { code: "SET", label: "Sets" },
  { code: "SQF", label: "Square feet" },
  { code: "SQM", label: "Square meters" },
  { code: "SQY", label: "Square yards" },
  { code: "TBS", label: "Tablets" },
  { code: "TGM", label: "Ten gross" },
  { code: "THD", label: "Thousands" },
  { code: "TON", label: "Tonnes" },
  { code: "TUB", label: "Tubes" },
  { code: "UGS", label: "US gallons" },
  { code: "UNT", label: "Units" },
  { code: "YDS", label: "Yards" },
] as const;

export type UqcCode = (typeof UQC_CODES)[number]["code"];

const CODE_SET = new Set<string>(UQC_CODES.map((u) => u.code));

export function isUqcCode(value: string): value is UqcCode {
  return CODE_SET.has(value.toUpperCase());
}

/** "NOS-NUMBERS" as used in the offline utility CSV templates. */
export function uqcLabel(code: string): string {
  const found = UQC_CODES.find((u) => u.code === code);
  return found ? `${found.code}-${found.label.toUpperCase()}` : code;
}

/** Common unit spellings → UQC. Keys are lowercase with dots/spaces removed. */
const UNIT_MAP: Record<string, UqcCode> = {
  pcs: "PCS",
  pc: "PCS",
  piece: "PCS",
  pieces: "PCS",
  nos: "NOS",
  no: "NOS",
  number: "NOS",
  numbers: "NOS",
  kg: "KGS",
  kgs: "KGS",
  kilogram: "KGS",
  kilograms: "KGS",
  g: "GMS",
  gm: "GMS",
  gms: "GMS",
  gram: "GMS",
  grams: "GMS",
  ltr: "LTR",
  ltrs: "LTR",
  l: "LTR",
  litre: "LTR",
  litres: "LTR",
  liter: "LTR",
  liters: "LTR",
  ml: "MLT",
  millilitre: "MLT",
  milliliter: "MLT",
  m: "MTR",
  mtr: "MTR",
  mtrs: "MTR",
  meter: "MTR",
  meters: "MTR",
  metre: "MTR",
  metres: "MTR",
  sqft: "SQF",
  sqf: "SQF",
  sqm: "SQM",
  sqmt: "SQM",
  sqmtr: "SQM",
  box: "BOX",
  boxes: "BOX",
  set: "SET",
  sets: "SET",
  pair: "PRS",
  pairs: "PRS",
  prs: "PRS",
  dozen: "DOZ",
  dozens: "DOZ",
  doz: "DOZ",
  ton: "TON",
  tons: "TON",
  tonne: "TON",
  tonnes: "TON",
  bag: "BAG",
  bags: "BAG",
  bottle: "BTL",
  bottles: "BTL",
  btl: "BTL",
  unit: "UNT",
  units: "UNT",
};

/** Map a free-text unit to a UQC; time/service units and unknown units → OTH. */
export function unitToUqc(unit: string): UqcCode {
  const key = unit.toLowerCase().replace(/[\s.]/g, "");
  if (!key) return "OTH";
  if (UNIT_MAP[key]) return UNIT_MAP[key];
  const upper = key.toUpperCase();
  if (isUqcCode(upper)) return upper as UqcCode;
  return "OTH";
}

/** UQC for a line: the explicit line.uqc when set, else mapped from the unit. */
export function uqcFor(line: Pick<LineItem, "uqc" | "unit">): string {
  const explicit = line.uqc.trim().toUpperCase();
  if (explicit) return explicit;
  return unitToUqc(line.unit);
}
