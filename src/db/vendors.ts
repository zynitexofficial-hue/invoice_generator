import type { Vendor } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";

/** [D] Vendor master — owner: feature D. */

export type VendorInput = DeepPartial<Vendor>;

export const vendorsCrud = defineCrud({
  table: "vendors",
  entity: "vendor",
  what: "the vendor",
  describe: (v) => `vendor ${v.name}`.trim(),
  auditFields: {
    name: (v) => v.name,
    gstin: (v) => v.gstin,
    stateCode: (v) => v.stateCode,
    paymentTermsDays: (v) => String(v.paymentTermsDays),
    openingBalance: (v) => v.openingBalance,
    msme: (v) => String(v.msme),
    archived: (v) => String(v.archived),
  },
});

export const saveVendor = vendorsCrud.save;
export const getVendor = vendorsCrud.get;
export const deleteVendor = vendorsCrud.remove;
export const listVendors = vendorsCrud.list;
