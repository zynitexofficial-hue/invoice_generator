export interface IndianState {
  code: string;
  name: string;
  /** Union Territory without its own legislature: intra-state tax is CGST + UTGST. */
  utgst: boolean;
  /** Legacy codes are valid inside old GSTINs but are not offered in pickers. */
  legacy?: boolean;
}

/** GST state codes as used in GSTINs and "place of supply". */
export const INDIAN_STATES: IndianState[] = [
  { code: "01", name: "Jammu and Kashmir", utgst: false },
  { code: "02", name: "Himachal Pradesh", utgst: false },
  { code: "03", name: "Punjab", utgst: false },
  { code: "04", name: "Chandigarh", utgst: true },
  { code: "05", name: "Uttarakhand", utgst: false },
  { code: "06", name: "Haryana", utgst: false },
  { code: "07", name: "Delhi", utgst: false },
  { code: "08", name: "Rajasthan", utgst: false },
  { code: "09", name: "Uttar Pradesh", utgst: false },
  { code: "10", name: "Bihar", utgst: false },
  { code: "11", name: "Sikkim", utgst: false },
  { code: "12", name: "Arunachal Pradesh", utgst: false },
  { code: "13", name: "Nagaland", utgst: false },
  { code: "14", name: "Manipur", utgst: false },
  { code: "15", name: "Mizoram", utgst: false },
  { code: "16", name: "Tripura", utgst: false },
  { code: "17", name: "Meghalaya", utgst: false },
  { code: "18", name: "Assam", utgst: false },
  { code: "19", name: "West Bengal", utgst: false },
  { code: "20", name: "Jharkhand", utgst: false },
  { code: "21", name: "Odisha", utgst: false },
  { code: "22", name: "Chhattisgarh", utgst: false },
  { code: "23", name: "Madhya Pradesh", utgst: false },
  { code: "24", name: "Gujarat", utgst: false },
  { code: "25", name: "Daman and Diu", utgst: true, legacy: true },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", utgst: true },
  { code: "27", name: "Maharashtra", utgst: false },
  { code: "28", name: "Andhra Pradesh (Old)", utgst: false, legacy: true },
  { code: "29", name: "Karnataka", utgst: false },
  { code: "30", name: "Goa", utgst: false },
  { code: "31", name: "Lakshadweep", utgst: true },
  { code: "32", name: "Kerala", utgst: false },
  { code: "33", name: "Tamil Nadu", utgst: false },
  { code: "34", name: "Puducherry", utgst: false },
  { code: "35", name: "Andaman and Nicobar Islands", utgst: true },
  { code: "36", name: "Telangana", utgst: false },
  { code: "37", name: "Andhra Pradesh", utgst: false },
  { code: "38", name: "Ladakh", utgst: true },
  { code: "97", name: "Other Territory", utgst: true },
];

/** Place-of-supply code used for supplies to customers outside India. */
export const OTHER_COUNTRY_CODE = "96";

const BY_CODE = new Map(INDIAN_STATES.map((s) => [s.code, s]));

/** States offered in pickers (no legacy codes), sorted by name. */
export const SELECTABLE_STATES = INDIAN_STATES.filter((s) => !s.legacy).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function getState(code: string | undefined | null): IndianState | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code);
}

export function isValidStateCode(code: string) {
  return BY_CODE.has(code);
}

export function stateName(code: string | undefined | null): string {
  if (code === OTHER_COUNTRY_CODE) return "Outside India";
  return getState(code)?.name ?? "";
}

export function isUtgstTerritory(code: string | undefined | null) {
  return getState(code)?.utgst ?? false;
}

/** "Maharashtra (27)" */
export function stateLabel(code: string | undefined | null): string {
  if (!code) return "";
  const name = stateName(code);
  return name ? `${name} (${code})` : code;
}

/** "West Bengal (Code 19)" — the state name with its GST state code, as printed on invoices. */
export function stateWithCode(code: string | undefined | null): string {
  if (!code) return "";
  if (code === OTHER_COUNTRY_CODE) return "Outside India (Code 96)";
  const name = stateName(code);
  return name ? `${name} (Code ${code})` : code;
}
