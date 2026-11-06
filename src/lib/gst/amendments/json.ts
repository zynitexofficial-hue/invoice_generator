import { portalDate } from "@/lib/gst/returns/gstr1-json";
import { toNum2 } from "@/lib/gst/returns/internal";
import type { AmendDoc } from "@/lib/schema";
import type { AmendedRow, AmendmentSections } from "./sections";

/**
 * Portal JSON for the amendment tables, merged into the GSTR-1 file.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ UNCONFIRMED KEYS. The GST offline-utility schema for amendments      │
 * │ could not be fetched while building this. Keys follow the author's   │
 * │ knowledge of the same-named tables (b2ba, b2cla, expa, cdnra,        │
 * │ cdnura, b2csa; oinum/oidt = original number/date). VERIFY AGAINST    │
 * │ THE CURRENT OFFLINE UTILITY before uploading.                        │
 * └──────────────────────────────────────────────────────────────────────┘
 */

function itms(d: AmendDoc, interState: boolean) {
  return d.items.map((item, i) => ({
    num: i + 1,
    itm_det: interState
      ? {
          txval: toNum2(item.taxable),
          rt: Number(item.rate),
          iamt: toNum2(item.igst),
          csamt: toNum2(item.cess),
        }
      : {
          txval: toNum2(item.taxable),
          rt: Number(item.rate),
          camt: toNum2(item.cgst),
          samt: toNum2(item.sgst),
          csamt: toNum2(item.cess),
        },
  }));
}

function group<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map];
}

const yn = (b: boolean) => (b ? "Y" : "N");

const invJson = (r: AmendedRow) => ({
  oinum: r.original.number,
  oidt: portalDate(r.original.date),
  inum: r.revised.number,
  idt: portalDate(r.revised.date),
  val: toNum2(r.revised.value),
});

/** Keys to merge into the GSTR-1 JSON object. Empty sections are omitted. */
export function amendmentJson(s: AmendmentSections): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { b2ba, b2cla, expa, cdnra, cdnura } = s.rows;

  if (b2ba.length)
    out.b2ba = group(b2ba, (r) => r.revised.ctin).map(([ctin, rows]) => ({
      ctin,
      inv: rows.map((r) => ({
        ...invJson(r),
        pos: r.revised.pos,
        rchrg: yn(r.revised.reverseCharge),
        inv_typ: r.revised.invType,
        itms: itms(r.revised, r.revised.interState),
      })),
    }));
  if (b2cla.length)
    out.b2cla = group(b2cla, (r) => r.revised.pos).map(([pos, rows]) => ({
      pos,
      inv: rows.map((r) => ({ ...invJson(r), itms: itms(r.revised, true) })),
    }));
  if (expa.length)
    out.expa = group(expa, (r) => r.revised.exportType || "WOPAY").map(([exp_typ, rows]) => ({
      exp_typ,
      inv: rows.map((r) => ({
        ...invJson(r),
        itms: r.revised.items.map((it) => ({
          txval: toNum2(it.taxable),
          rt: Number(it.rate),
          iamt: toNum2(it.igst),
          csamt: toNum2(it.cess),
        })),
      })),
    }));
  const noteJson = (r: AmendedRow) => ({
    ntty: r.revised.noteType || "C",
    ont_num: r.original.number,
    ont_dt: portalDate(r.original.date),
    nt_num: r.revised.number,
    nt_dt: portalDate(r.revised.date),
    val: toNum2(r.revised.value),
  });
  if (cdnra.length)
    out.cdnra = group(cdnra, (r) => r.revised.ctin).map(([ctin, rows]) => ({
      ctin,
      nt: rows.map((r) => ({
        ...noteJson(r),
        pos: r.revised.pos,
        rchrg: yn(r.revised.reverseCharge),
        inv_typ: r.revised.invType,
        itms: itms(r.revised, r.revised.interState),
      })),
    }));
  if (cdnura.length)
    out.cdnura = cdnura.map((r) => ({
      typ: r.revised.urType || "B2CL",
      ...noteJson(r),
      ...(r.revised.urType === "B2CL" || !r.revised.urType ? { pos: r.revised.pos } : {}),
      itms: itms(r.revised, true),
    }));
  if (s.b2csa.length)
    out.b2csa = s.b2csa.map((r) => {
      const [y, m] = r.month.split("-");
      return {
        omon: `${m}${y}`,
        sply_ty: r.supplyType,
        pos: r.pos,
        typ: "OE",
        txval: toNum2(r.taxable),
        rt: Number(r.rate),
        ...(r.supplyType === "INTER"
          ? { iamt: toNum2(r.igst) }
          : { camt: toNum2(r.cgst), samt: toNum2(r.sgst) }),
        csamt: toNum2(r.cess),
      };
    });
  return out;
}
