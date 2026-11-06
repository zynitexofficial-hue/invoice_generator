import type { CsvCell } from "@/lib/csv";
import { HEADS, type Gstr3bWorksheet, type Heads } from "@/lib/gst/gstr3b";
import type { Formatters } from "../gstr1-tab";

/** CSV rows of the full worksheet (Table 4, reverse charge, set-off), appended to the 3.1/3.2 rows. */
export function worksheetCsvRows(ws: Gstr3bWorksheet): CsvCell[][] {
  const h = (table: string, label: string, v: Heads): CsvCell[] => [
    table,
    label,
    "",
    v.igst,
    v.cgst,
    v.sgst,
    v.cess,
  ];
  const s = ws.setOff;
  return [
    h("3.1(d)", "Inward supplies liable to reverse charge", ws.table31d.heads),
    h("Amendments", ws.amendments.label, ws.amendments.heads),
    ...ws.itcRows.map((r) => h(r.id, r.label, r.heads)),
    h("Estimate", "Output tax incl. amendments", ws.outputTax),
    h("Estimate", "Reverse charge tax (cash only)", ws.rcmTax),
    h("Estimate", "ITC available (opening balance + 4C)", s.creditAvailable),
    h("Estimate", "Paid using ITC", s.paidByItc),
    h("Estimate", "Tax payable in cash", s.payableCash),
    h("Estimate", "Cash ledger balance (entered)", s.cashBalance),
    h("Estimate", "Extra cash to deposit", s.cashShortfall),
    h("Estimate", "ITC left after set-off", s.creditLeft),
    ...s.steps.map((st): CsvCell[] => [
      "Set-off",
      `${st.from.toUpperCase()} credit pays ${st.to.toUpperCase()} tax`,
      "",
      st.amount,
    ]),
  ];
}

/** Print tables for the full worksheet (used inside the print portal). */
export function WorksheetPrintTables({ ws, f }: { ws: Gstr3bWorksheet; f: Formatters }) {
  const s = ws.setOff;
  const rows: [string, string, Heads][] = [
    ["3.1(d)", "Inward supplies liable to reverse charge", ws.table31d.heads],
    ["", ws.amendments.label, ws.amendments.heads],
    ...ws.itcRows.map((r): [string, string, Heads] => [r.id, r.label, r.heads]),
  ];
  const est: [string, Heads][] = [
    ["Output tax (incl. amendments)", ws.outputTax],
    ["Reverse charge (cash only)", ws.rcmTax],
    ["ITC available (opening + 4C)", s.creditAvailable],
    ["Paid using ITC", s.paidByItc],
    ["Tax payable in cash", s.payableCash],
    ["Cash ledger balance", s.cashBalance],
    ["Extra cash to deposit", s.cashShortfall],
    ["ITC left", s.creditLeft],
  ];
  const head = (
    <tr>
      <th />
      <th />
      {HEADS.map((x) => (
        <th key={x} className="num">
          {x.toUpperCase()}
        </th>
      ))}
    </tr>
  );
  return (
    <>
      <h2>Table 4 and reverse charge</h2>
      <table>
        <thead>{head}</thead>
        <tbody>
          {rows.map(([id, label, v]) => (
            <tr key={`${id}${label}`}>
              <td>{id}</td>
              <td>{label}</td>
              {HEADS.map((x) => (
                <td key={x} className="num">
                  {f.money(v[x])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Estimated tax payable</h2>
      <table>
        <thead>{head}</thead>
        <tbody>
          {est.map(([label, v]) => (
            <tr key={label}>
              <td />
              <td>{label}</td>
              {HEADS.map((x) => (
                <td key={x} className="num">
                  {f.money(v[x])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Set-off notes</h2>
      <ul>
        {s.steps.map((st, i) => (
          <li key={i}>
            {st.from.toUpperCase()} credit pays {st.to.toUpperCase()} tax: {f.money(st.amount)}
          </li>
        ))}
        {ws.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  );
}
