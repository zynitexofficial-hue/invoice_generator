"use client";

import {
  ContinuationBar,
  CustomerDetails,
  Logo,
  MetaList,
  SellerDetails,
  ShipToDetails,
  TotalsSection,
} from "../blocks";
import { useDoc } from "../context";
import { MM_TO_PX } from "../layout";
import type { DocumentTemplate } from "./types";

const STRIP_MM = 6;

function Header() {
  const { vm } = useDoc();
  const ship = vm.customer.shipTo.length > 0;
  return (
    <div style={{ paddingBottom: "1.6em" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "2em",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              fontSize: "2.9em",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: "var(--doc-primary)",
            }}
          >
            {vm.title}
            <span style={{ color: "var(--doc-accent)" }}>.</span>
          </div>
          <div style={{ display: "flex", gap: "0.5em", marginTop: "0.9em", flexWrap: "wrap" }}>
            <Chip>{vm.number}</Chip>
            <Chip muted>{vm.issueDate}</Chip>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 0, flex: 1 }}>
          {vm.seller.logo && (
            <Logo
              style={{ marginLeft: "auto", marginBottom: "0.7em", objectPosition: "right center" }}
            />
          )}
          <SellerDetails align="right" />
        </div>
      </div>

      <div
        style={{
          marginTop: "1.5em",
          borderRadius: "1em",
          padding: "1.15em 1.3em",
          background: "linear-gradient(120deg, var(--doc-primary), var(--doc-accent))",
          color: "var(--doc-on-primary)",
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr auto" : "1fr auto",
          gap: "1.6em",
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Eyebrow>Billed to</Eyebrow>
          <div
            style={
              {
                "--doc-muted": "currentColor",
                "--doc-subtle": "currentColor",
              } as React.CSSProperties
            }
          >
            <CustomerDetails />
          </div>
        </div>
        {ship && (
          <div style={{ minWidth: 0, "--doc-muted": "currentColor" } as React.CSSProperties}>
            <Eyebrow>Ship to</Eyebrow>
            <ShipToDetails />
          </div>
        )}
        <div style={{ textAlign: "right" }}>
          <Eyebrow>{vm.amountDueLabel}</Eyebrow>
          <div className="doc-num" style={{ fontSize: "1.9em", fontWeight: 800, lineHeight: 1.1 }}>
            {vm.amountDue}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1em", "--doc-muted": "var(--doc-subtle)" } as React.CSSProperties}>
        <MetaList skipNumber rowGap="0.1em" />
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.72em",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        opacity: 0.85,
        marginBottom: "0.35em",
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="doc-num"
      style={{
        display: "inline-block",
        padding: "0.25em 0.75em",
        borderRadius: "999px",
        fontWeight: 600,
        fontSize: "0.9em",
        background: muted ? "var(--doc-surface)" : "var(--doc-accent-soft)",
        color: muted ? "var(--doc-muted)" : "var(--doc-text)",
      }}
    >
      {children}
    </span>
  );
}

function Decor() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: `${STRIP_MM}mm`,
          background: "linear-gradient(180deg, var(--doc-primary), var(--doc-accent))",
        }}
      />
    </>
  );
}

export const creativeTemplate: DocumentTemplate = {
  id: "creative",
  // The gradient strip sits in the left margin; keep content clear of it.
  pageBox: (base) => ({ ...base, left: Math.max(base.left, STRIP_MM * MM_TO_PX + 8 * MM_TO_PX) }),
  Header,
  ContinuationHeader: () => <ContinuationBar />,
  Decor,
  sections: { totals: () => <TotalsSection variant="accent" /> },
};
