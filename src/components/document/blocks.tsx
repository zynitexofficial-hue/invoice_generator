"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ColumnKey, DocRow, DocViewModel } from "@/lib/render/view-model";
import type { DesignCustomization, SectionId } from "@/lib/schema";
import { payPageHref } from "@/lib/upi";
import { useMounted } from "@/hooks/use-mounted";
import { useDoc } from "./context";
import { QrCodeSvg } from "./qr-code";

/* eslint-disable @next/next/no-img-element -- documents use plain <img> for data-URL logos */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------------- Small primitives ---------------- */

export function Logo({ className, style }: { className?: string; style?: CSSProperties }) {
  const { vm, design } = useDoc();
  if (!vm.seller.logo) return null;
  return (
    <img
      className={cx("doc-logo", className)}
      data-size={design.logoSize}
      src={vm.seller.logo}
      alt=""
      style={style}
      decoding="sync"
    />
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("doc-label", className)} style={{ marginBottom: "0.45em" }}>
      {children}
    </div>
  );
}

export function TaxLines({
  items,
  inline = false,
}: {
  items: { label: string; value: string }[];
  inline?: boolean;
}) {
  if (!items.length) return null;
  if (inline) {
    return (
      <div style={{ marginTop: "0.3em" }}>
        {items.map((t) => (
          <span key={t.label} style={{ marginRight: "1.1em", whiteSpace: "nowrap" }}>
            <span className="doc-muted">{t.label}: </span>
            <span style={{ fontWeight: 600 }}>{t.value}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div style={{ marginTop: "0.35em" }}>
      {items.map((t) => (
        <div key={t.label}>
          <span className="doc-muted">{t.label}: </span>
          <span style={{ fontWeight: 600 }}>{t.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Seller identity: name, address, contacts and tax ids. */
export function SellerDetails({
  showName = true,
  nameStyle,
  align = "left",
  inlineTax = false,
  muted = true,
}: {
  showName?: boolean;
  nameStyle?: CSSProperties;
  align?: "left" | "right" | "center";
  inlineTax?: boolean;
  muted?: boolean;
}) {
  const { vm } = useDoc();
  const s = vm.seller;
  return (
    <div style={{ textAlign: align }} className="doc-break">
      {showName && (
        <div style={{ fontSize: "1.25em", fontWeight: 700, lineHeight: 1.25, ...nameStyle }}>
          {s.name || <span style={{ color: "var(--doc-subtle)" }}>Your business name</span>}
        </div>
      )}
      <div
        className={muted ? "doc-muted" : undefined}
        style={{ marginTop: showName ? "0.3em" : 0 }}
      >
        {s.addressLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {s.contacts.length > 0 && <div>{s.contacts.join("  ·  ")}</div>}
      </div>
      <TaxLines items={s.tax} inline={inlineTax} />
    </div>
  );
}

export function CustomerDetails({ nameStyle }: { nameStyle?: CSSProperties }) {
  const { vm } = useDoc();
  const c = vm.customer;
  if (!vm.hasCustomer) {
    return <div style={{ color: "var(--doc-subtle)", fontStyle: "italic" }}>Customer details</div>;
  }
  return (
    <div className="doc-break">
      <div style={{ fontSize: "1.1em", fontWeight: 650, lineHeight: 1.3, ...nameStyle }}>
        {c.name || c.company}
      </div>
      {c.name && c.company && <div style={{ fontWeight: 500 }}>{c.company}</div>}
      <div className="doc-muted" style={{ marginTop: "0.2em" }}>
        {c.addressLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {c.contacts.length > 0 && <div>{c.contacts.join("  ·  ")}</div>}
      </div>
      <TaxLines items={c.tax} />
    </div>
  );
}

export function ShipToDetails() {
  const { vm } = useDoc();
  if (!vm.customer.shipTo.length) return null;
  return (
    <div className="doc-muted doc-break">
      {vm.customer.shipTo.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

/** Key/value list of document meta (number, dates, place of supply…). */
export function MetaList({
  align = "left",
  skipNumber = false,
  exclude,
  rowGap = "0.15em",
  labelStyle,
  valueStyle,
}: {
  align?: "left" | "right";
  skipNumber?: boolean;
  exclude?: string[];
  rowGap?: string;
  labelStyle?: CSSProperties;
  valueStyle?: CSSProperties;
}) {
  const { vm } = useDoc();
  const items = (skipNumber ? vm.meta.slice(1) : vm.meta).filter(
    (m) => !exclude?.includes(m.label),
  );
  return (
    <dl
      className="doc-kv"
      style={{
        rowGap,
        justifyContent: align === "right" ? "end" : "start",
        margin: 0,
      }}
    >
      {items.map((m) => (
        <MetaPair
          key={m.label}
          label={m.label}
          value={m.value}
          labelStyle={labelStyle}
          valueStyle={valueStyle}
          align={align}
        />
      ))}
    </dl>
  );
}

function MetaPair({
  label,
  value,
  labelStyle,
  valueStyle,
  align,
}: {
  label: string;
  value: string;
  labelStyle?: CSSProperties;
  valueStyle?: CSSProperties;
  align: "left" | "right";
}) {
  return (
    <>
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ textAlign: align, ...valueStyle }}>{value}</dd>
    </>
  );
}

/* ---------------- Line items ---------------- */

const DEFAULT_LABELS: Record<ColumnKey, string> = {
  index: "#",
  item: "Item & description",
  hsn: "HSN/SAC",
  qty: "Qty",
  price: "Rate",
  discount: "Disc.",
  tax: "GST",
  amount: "Amount",
};

export function TableHead({ labels }: { labels?: Partial<Record<ColumnKey, string>> }) {
  const { vm } = useDoc();
  return (
    <div className="doc-grid doc-thead" role="row">
      {vm.columns.map((c) => (
        <div
          key={c.key}
          role="columnheader"
          className={cx("doc-th", c.align === "right" && "doc-align-right")}
        >
          {labels?.[c.key] ?? (c.key === "tax" ? c.label : DEFAULT_LABELS[c.key])}
        </div>
      ))}
    </div>
  );
}

export function Row({ row, index }: { row: DocRow; index: number }) {
  const { vm } = useDoc();
  return (
    <div className="doc-grid doc-row" data-odd={index % 2 === 1 ? "true" : "false"} role="row">
      {vm.columns.map((c) => (
        <div
          key={c.key}
          role="cell"
          className={cx("doc-td", c.align === "right" && "doc-align-right")}
        >
          <Cell column={c.key} row={row} />
        </div>
      ))}
    </div>
  );
}

function Cell({ column, row }: { column: ColumnKey; row: DocRow }) {
  switch (column) {
    case "index":
      return <span className="doc-muted doc-num">{row.index}</span>;
    case "item":
      return (
        <>
          <div className="doc-item-name">{row.name || row.description}</div>
          {row.name && row.description && <div className="doc-item-desc">{row.description}</div>}
        </>
      );
    case "hsn":
      return <span className="doc-num">{row.hsn}</span>;
    case "qty":
      return <span className="doc-num">{row.qty}</span>;
    case "price":
      return <span className="doc-num">{row.price}</span>;
    case "discount":
      return <span className="doc-num">{row.discount}</span>;
    case "tax":
      return (
        <span className="doc-num">
          {row.taxRate}
          <span className="doc-tax-amt">{row.taxAmount}</span>
        </span>
      );
    case "amount":
      return (
        <span className="doc-num" style={{ fontWeight: 600 }}>
          {row.amount}
        </span>
      );
  }
}

export function EmptyRow() {
  return <div className="doc-empty-row">No items yet</div>;
}

/* ---------------- Sections ---------------- */

export type TotalsVariant = "plain" | "primary" | "boxed" | "accent";

export function TotalsSection({ variant = "plain" }: { variant?: TotalsVariant }) {
  const { vm } = useDoc();
  const left = vm.words || vm.declaration || vm.received;
  return (
    <div className="doc-section" style={{ display: "flex", gap: "2em", alignItems: "flex-start" }}>
      {left ? (
        <div style={{ flex: 1, minWidth: 0 }} className="doc-break">
          {vm.words && (
            <div style={{ marginBottom: "0.8em" }}>
              <SectionTitle>Amount in words</SectionTitle>
              <div style={{ fontWeight: 550 }}>{vm.words}</div>
            </div>
          )}
          {vm.received && (
            <div style={{ marginBottom: "0.8em" }} className="doc-muted">
              Received {vm.received}
              {vm.receivedNote ? ` ${vm.receivedNote}` : ""}.
            </div>
          )}
          {vm.declaration && (
            <div
              style={{
                fontSize: "0.88em",
                padding: "0.55em 0.75em",
                borderLeft: "2px solid var(--doc-primary-line)",
                background: "var(--doc-surface)",
                borderRadius: "0 0.35em 0.35em 0",
              }}
            >
              {vm.declaration}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <div
        className="doc-totals"
        data-has-stamp={vm.stamp ? "true" : undefined}
        style={
          variant === "boxed"
            ? {
                border: "1px solid var(--doc-border-strong)",
                borderRadius: "0.45em",
                padding: "0.4em 0.9em",
              }
            : undefined
        }
      >
        {vm.stamp && (
          <div style={{ textAlign: "right", marginBottom: "0.7em" }}>
            <span className="doc-stamp doc-stamp-inline" data-status={vm.stamp}>
              {vm.stamp}
            </span>
          </div>
        )}
        {vm.totals.map((row) => (
          <div
            key={row.key}
            className="doc-total-row"
            data-tone={row.tone}
            style={totalRowStyle(row.tone, variant)}
          >
            <span>{row.label}</span>
            <span className="doc-num">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function totalRowStyle(tone: string, variant: TotalsVariant): CSSProperties | undefined {
  if (tone !== "grand") return undefined;
  switch (variant) {
    case "primary":
      return {
        background: "var(--doc-primary)",
        color: "var(--doc-on-primary)",
        borderTop: 0,
        borderRadius: "0.45em",
        padding: "0.6em 0.8em",
        marginTop: "0.5em",
      };
    case "accent":
      return {
        borderTop: 0,
        borderBottom: "3px solid var(--doc-accent)",
        paddingBottom: "0.4em",
        color: "var(--doc-primary)",
      };
    case "boxed":
      return { color: "var(--doc-primary)" };
    default:
      return undefined;
  }
}

export function TaxSummarySection() {
  const { vm } = useDoc();
  if (!vm.taxSummary) return null;
  return (
    <div className="doc-section">
      <SectionTitle>Tax summary</SectionTitle>
      <table className="doc-subtable doc-num">
        <thead>
          <tr>
            {vm.taxSummary.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vm.taxSummary.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {vm.taxSummary.total.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Advance / milestone plan: what is payable, when, and (on invoices) what is already paid. */
export function ScheduleSection() {
  const { vm } = useDoc();
  const s = vm.schedule;
  if (!s) return null;
  const left = { textAlign: "left" } as const;
  return (
    <div className="doc-section">
      <SectionTitle>Payment terms</SectionTitle>
      <table className="doc-subtable">
        <thead>
          <tr>
            <th style={{ width: "2em" }}>#</th>
            <th style={left}>Milestone</th>
            {s.hasDue && <th style={left}>When</th>}
            <th>Share</th>
            <th>Amount</th>
            {s.hasStatus && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.id}>
              <td className="doc-muted doc-num">{r.index}</td>
              <td style={{ ...left, fontWeight: 550 }} className="doc-break">
                {r.label}
              </td>
              {s.hasDue && (
                <td style={left} className="doc-muted doc-break">
                  {r.due}
                </td>
              )}
              <td className="doc-num">{r.share}</td>
              <td className="doc-num">{r.amount}</td>
              {s.hasStatus && (
                <td style={{ fontWeight: 600, color: r.status === "Paid" ? "#15803d" : undefined }}>
                  {r.status}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={s.hasDue ? 4 : 3} style={left}>
              Total
            </td>
            <td className="doc-num">{s.total}</td>
            {s.hasStatus && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PaymentSection({ boxed = true }: { boxed?: boolean }) {
  const { vm } = useDoc();
  const p = vm.payment;
  if (!p) return null;
  if (p.preferred) return <RankedPayment boxed={boxed} />;
  const hasQr = Boolean(p.upiUri || p.qrImage);
  return (
    <div className="doc-section">
      <div
        className={boxed ? "doc-box" : undefined}
        style={{
          display: "flex",
          gap: "1.5em",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }} className="doc-break">
          <SectionTitle>Payment details</SectionTitle>
          {p.bank.length > 0 && (
            <dl className="doc-kv" style={{ margin: 0 }}>
              {p.bank.map((b) => (
                <MetaPair key={b.label} label={b.label} value={b.value} align="left" />
              ))}
              {p.upiId && !hasQr && <MetaPair label="UPI" value={p.upiId} align="left" />}
            </dl>
          )}
          {p.bank.length === 0 && p.upiId && !hasQr && (
            <dl className="doc-kv" style={{ margin: 0 }}>
              <MetaPair label="UPI" value={p.upiId} align="left" />
            </dl>
          )}
          {p.instructions && (
            <div className="doc-pre doc-muted" style={{ marginTop: p.bank.length ? "0.6em" : 0 }}>
              {p.instructions}
            </div>
          )}
        </div>
        {hasQr && <PaymentQr />}
      </div>
    </div>
  );
}

/** Generated UPI QR (with the amount it asks for) or the seller's uploaded QR. */
function PaymentQr() {
  const { vm } = useDoc();
  const p = vm.payment!;
  // The link needs this site's address, known only in the browser (documents print client-side).
  const mounted = useMounted();
  const href = mounted && p.payParams ? payPageHref(window.location.origin, p.payParams) : "";
  const code = p.qrImage ? (
    <img
      className="doc-qr"
      src={p.qrImage}
      alt="Payment QR code"
      decoding="sync"
      style={{ objectFit: "contain" }}
    />
  ) : (
    p.upiUri && <QrCodeSvg value={p.upiUri} className="doc-qr" title="UPI payment QR code" />
  );
  return (
    <div style={{ textAlign: "center", flexShrink: 0 }}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block" }}
        >
          {code}
        </a>
      ) : (
        code
      )}
      <div style={{ fontSize: "0.78em", fontWeight: 600, marginTop: "0.3em" }}>
        {p.qrImage ? "Scan to pay" : "Scan to pay via UPI"}
      </div>
      {p.qrAmount && (
        <div className="doc-num" style={{ fontSize: "0.78em", fontWeight: 600 }}>
          {p.qrAmount}
          {p.qrFor ? ` · ${p.qrFor}` : ""}
        </div>
      )}
      {p.upiId && (
        <div style={{ fontSize: "0.88em", fontWeight: 500, marginTop: "0.1em" }}>{p.upiId}</div>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: "0.35em",
            padding: "0.25em 0.75em",
            borderRadius: "999px",
            background: "var(--doc-primary)",
            color: "var(--doc-on-primary)",
            fontSize: "0.78em",
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          Tap to pay via UPI
        </a>
      )}
    </div>
  );
}

/** Bank and UPI side by side; the preferred one comes first on a soft highlight. */
function RankedPayment({ boxed }: { boxed: boolean }) {
  const { vm } = useDoc();
  const p = vm.payment!;
  const hasQr = Boolean(p.upiUri || p.qrImage);
  const panel = (method: "bank" | "upi"): CSSProperties =>
    p.preferred === method
      ? {
          background: "var(--doc-primary-tint)",
          border: "1px solid var(--doc-primary-line)",
          borderRadius: "0.45em",
          padding: "0.6em 0.8em",
        }
      : { padding: "0.6em 0" };
  const heading = (method: "bank" | "upi", name: string) => (
    <div
      style={{
        marginBottom: "0.4em",
        fontWeight: 650,
        color: p.preferred === method ? "var(--doc-primary)" : undefined,
      }}
    >
      {name}
    </div>
  );
  const bank = (
    <div key="bank" style={{ flex: 1, minWidth: 0, ...panel("bank") }} className="doc-break">
      {heading("bank", "Bank transfer")}
      <dl className="doc-kv" style={{ margin: 0 }}>
        {p.bank.map((b) => (
          <MetaPair key={b.label} label={b.label} value={b.value} align="left" />
        ))}
      </dl>
    </div>
  );
  const upi = (
    <div
      key="upi"
      style={{ ...(hasQr ? { flexShrink: 0 } : { flex: 1, minWidth: 0 }), ...panel("upi") }}
      className="doc-break"
    >
      {heading("upi", "UPI")}
      {hasQr ? (
        <PaymentQr />
      ) : (
        <dl className="doc-kv" style={{ margin: 0 }}>
          <MetaPair label="UPI ID" value={p.upiId} align="left" />
        </dl>
      )}
    </div>
  );
  return (
    <div className="doc-section">
      <div className={boxed ? "doc-box" : undefined}>
        <SectionTitle>Payment details</SectionTitle>
        <div style={{ display: "flex", gap: "1.5em", alignItems: "flex-start" }}>
          {p.preferred === "upi" ? [upi, bank] : [bank, upi]}
        </div>
        {p.instructions && (
          <div className="doc-pre doc-muted" style={{ marginTop: "0.7em" }}>
            {p.instructions}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotesSection() {
  const { vm } = useDoc();
  if (!vm.notes) return null;
  return (
    <div className="doc-section">
      <SectionTitle>Notes</SectionTitle>
      <div className="doc-pre">{vm.notes}</div>
    </div>
  );
}

export function TermsSection() {
  const { vm } = useDoc();
  if (!vm.terms) return null;
  return (
    <div className="doc-section">
      <SectionTitle>Terms &amp; conditions</SectionTitle>
      <div className="doc-pre doc-muted" style={{ fontSize: "0.92em" }}>
        {vm.terms}
      </div>
    </div>
  );
}

export function SignatureSection({ boxed = false }: { boxed?: boolean }) {
  const { vm } = useDoc();
  const s = vm.seller;
  return (
    <div className="doc-section" style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          minWidth: "13em",
          textAlign: "right",
          ...(boxed
            ? {
                border: "1px solid var(--doc-border-strong)",
                borderRadius: "0.45em",
                padding: "0.7em 0.9em",
              }
            : {}),
        }}
      >
        <div style={{ fontWeight: 600 }}>For {s.name || "your business"}</div>
        <div
          style={{
            height: "3.8em",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {s.signature ? (
            <img className="doc-signature-img" src={s.signature} alt="" decoding="sync" />
          ) : null}
        </div>
        <div style={{ borderTop: "1px solid var(--doc-border-strong)", paddingTop: "0.35em" }}>
          {s.signatoryName && <div style={{ fontWeight: 600 }}>{s.signatoryName}</div>}
          <div className="doc-muted" style={{ fontSize: "0.88em" }}>
            Authorised signatory
          </div>
        </div>
      </div>
    </div>
  );
}

export function sectionHasContent(
  id: SectionId,
  vm: DocViewModel,
  design: DesignCustomization,
): boolean {
  switch (id) {
    case "totals":
      return true;
    case "schedule":
      return Boolean(vm.schedule);
    case "taxSummary":
      return Boolean(vm.taxSummary);
    case "payment":
      return Boolean(vm.payment);
    case "notes":
      return Boolean(vm.notes);
    case "terms":
      return Boolean(vm.terms);
    case "signature":
      return design.show.signature;
  }
}

/* ---------------- Page chrome ---------------- */

export function PageFooter({ pageIndex, pageCount }: { pageIndex: number; pageCount: number }) {
  const { vm, design } = useDoc();
  const showNumbers = design.show.pageNumbers && pageCount > 1;
  if (!vm.footer && !showNumbers) return null;
  return (
    <div className="doc-footer" data-align={design.footerAlign}>
      {vm.footer && (
        <div style={{ flex: showNumbers ? 1 : undefined }} className="doc-break">
          {vm.footer}
        </div>
      )}
      {showNumbers && (
        <div
          className="doc-num"
          style={{ marginLeft: vm.footer ? undefined : "auto", flexShrink: 0 }}
        >
          Page {pageIndex + 1} of {pageCount}
        </div>
      )}
    </div>
  );
}

export function Stamp({ style }: { style?: CSSProperties }) {
  const { vm } = useDoc();
  if (!vm.stamp) return null;
  return (
    <div className="doc-stamp" data-status={vm.stamp} style={style} aria-hidden>
      {vm.stamp}
    </div>
  );
}

/** Compact header repeated at the top of pages 2+. */
export function ContinuationBar({ style }: { style?: CSSProperties }) {
  const { vm } = useDoc();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "1em",
        paddingBottom: "0.7em",
        marginBottom: "1.1em",
        borderBottom: "1px solid var(--doc-border)",
        fontSize: "0.9em",
        ...style,
      }}
    >
      <span style={{ fontWeight: 600 }}>{vm.seller.name}</span>
      <span className="doc-muted">
        {vm.title} · {vm.number} <span style={{ opacity: 0.8 }}>(continued)</span>
      </span>
    </div>
  );
}

/** Logo alignment helper used by headers. */
export function useLogoPosition() {
  const { design, vm } = useDoc();
  return vm.seller.logo ? design.logoPosition : null;
}
