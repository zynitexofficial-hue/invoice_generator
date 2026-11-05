"use client";

import {
  TotalsSection,
  CustomerDetails,
  Logo,
  MetaList,
  SectionTitle,
  ShipToDetails,
  ContinuationBar,
} from "../blocks";
import { useDoc } from "../context";
import type { DecorProps, DocumentTemplate } from "./types";

function Header() {
  const { vm, design } = useDoc();
  const s = vm.seller;
  const ship = vm.customer.shipTo.length > 0;
  return (
    <div style={{ paddingBottom: "1.6em" }}>
      {/* Full-bleed colour band */}
      <div
        style={{
          margin: "calc(-1 * var(--pad-t)) calc(-1 * var(--pad-r)) 0 calc(-1 * var(--pad-l))",
          padding: "calc(var(--pad-t) * 0.9) var(--pad-r) 1.7em var(--pad-l)",
          background: "var(--doc-primary)",
          color: "var(--doc-on-primary)",
          display: "flex",
          justifyContent: "space-between",
          gap: "2em",
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }} className="doc-break">
          {s.logo && (
            <div
              style={{
                display: "inline-block",
                background: "#fff",
                borderRadius: "0.5em",
                padding: "0.45em 0.6em",
                marginBottom: "0.8em",
              }}
            >
              <Logo />
            </div>
          )}
          <div style={{ fontSize: "1.35em", fontWeight: 750, lineHeight: 1.2 }}>
            {s.name || "Your business name"}
          </div>
          <div style={{ opacity: 0.85, marginTop: "0.3em" }}>
            {s.addressLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            {s.contacts.length > 0 && <div>{s.contacts.join("  ·  ")}</div>}
            {s.tax.length > 0 && (
              <div style={{ marginTop: "0.25em" }}>
                {s.tax.map((t) => (
                  <span key={t.label} style={{ marginRight: "1em", whiteSpace: "nowrap" }}>
                    {t.label}: <b>{t.value}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontSize: "0.8em",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            {vm.title}
          </div>
          <div
            className="doc-num"
            style={{ fontSize: "1.45em", fontWeight: 750, marginTop: "0.15em" }}
          >
            {vm.number}
          </div>
          <div
            style={{
              marginTop: "1.1em",
              fontSize: "0.8em",
              opacity: 0.85,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {vm.amountDueLabel}
          </div>
          <div
            className="doc-num"
            style={{ fontSize: "1.75em", fontWeight: 800, lineHeight: 1.15 }}
          >
            {vm.amountDue}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1.4em",
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr 1fr" : "1.3fr 1fr",
          gap: "0.9em",
        }}
      >
        <Card>
          <SectionTitle>Billed to</SectionTitle>
          <CustomerDetails />
        </Card>
        {ship && (
          <Card>
            <SectionTitle>Ship to</SectionTitle>
            <ShipToDetails />
          </Card>
        )}
        <Card accent={design.accentColor}>
          <SectionTitle>Details</SectionTitle>
          <MetaList skipNumber />
        </Card>
      </div>
    </div>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: "var(--doc-surface)",
        borderRadius: "0.7em",
        padding: "0.9em 1em",
        minWidth: 0,
        borderTop: accent ? "3px solid var(--doc-accent)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

function Decor({ pageIndex }: DecorProps) {
  return pageIndex === 0 ? null : (
    <div
      style={{
        position: "absolute",
        inset: "0 0 auto 0",
        height: "2.2mm",
        background: "var(--doc-primary)",
      }}
    />
  );
}

export const modernTemplate: DocumentTemplate = {
  id: "modern",
  Header,
  ContinuationHeader: () => <ContinuationBar />,
  Decor,
  sections: { totals: () => <TotalsSection variant="primary" /> },
};
