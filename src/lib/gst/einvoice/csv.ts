import type { CsvCell } from "@/lib/csv";
import { DRAFT_DISCLAIMER, PORTAL_URL, type EInvoiceBuild } from "./payload";

/**
 * One-row-per-item CSV preview of the e-invoice payloads, for human review
 * only. It is NOT an IRP upload format. Column names follow the JSON keys.
 */
export const EINVOICE_CSV_HEADERS = [
  "Doc type",
  "Doc no",
  "Doc date",
  "Supply type",
  "Reverse charge",
  "Seller GSTIN",
  "Buyer GSTIN",
  "Buyer name",
  "Buyer address",
  "Buyer city",
  "Buyer PIN",
  "Buyer state code",
  "Place of supply",
  "Sl no",
  "Item",
  "Service (Y/N)",
  "HSN/SAC",
  "Qty",
  "UQC",
  "Unit price",
  "Gross amount",
  "Discount",
  "Taxable value",
  "GST rate",
  "IGST",
  "CGST",
  "SGST",
  "Item total",
  "Invoice taxable total",
  "Invoice total",
  "Round off",
];

export function einvoiceCsvRows(builds: readonly EInvoiceBuild[]): CsvCell[][] {
  const rows: CsvCell[][] = [];
  for (const b of builds) {
    const p = b.payload;
    if (!p) continue;
    for (const it of p.ItemList)
      rows.push([
        p.DocDtls.Typ,
        p.DocDtls.No,
        p.DocDtls.Dt,
        p.TranDtls.SupTyp,
        p.TranDtls.RegRev,
        p.SellerDtls.Gstin,
        p.BuyerDtls.Gstin,
        p.BuyerDtls.LglNm,
        [p.BuyerDtls.Addr1, p.BuyerDtls.Addr2].filter(Boolean).join(" "),
        p.BuyerDtls.Loc,
        p.BuyerDtls.Pin,
        p.BuyerDtls.Stcd,
        p.BuyerDtls.Pos,
        it.SlNo,
        it.PrdDesc,
        it.IsServc,
        it.HsnCd,
        it.Qty,
        it.Unit,
        it.UnitPrice,
        it.TotAmt,
        it.Discount,
        it.AssAmt,
        it.GstRt,
        it.IgstAmt,
        it.CgstAmt,
        it.SgstAmt,
        it.TotItemVal,
        p.ValDtls.AssVal,
        p.ValDtls.TotInvVal,
        p.ValDtls.RndOffAmt,
      ]);
  }
  // Trailer rows so the draft status travels with the file.
  rows.push([]);
  rows.push([`DRAFT: ${DRAFT_DISCLAIMER}`]);
  rows.push([`Portal: ${PORTAL_URL}`]);
  return rows;
}
