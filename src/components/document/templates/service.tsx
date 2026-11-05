"use client";

import {
  ContinuationBar,
  CustomerDetails,
  Logo,
  MetaList,
  SectionTitle,
  SellerDetails,
  ShipToDetails,
  TotalsSection,
  useLogoPosition,
} from "../blocks";
import { useDoc } from "../context";
import type { DocumentTemplate } from "./types";

function Header() {
  const { vm } = useDoc();
  const logo = useLogoPosition();
  const ship = vm.customer.shipTo.length > 0;
  const reference = vm.meta.find((m) => m.label === "Reference")?.value;
  const po = vm.meta.find((m) => m.label === "PO No.")?.value;
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {logo && logo !== "right" && <Logo style={{ marginBottom: "0.9em" }} />}
          <SellerDetails />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {logo === "right" && (
            <Logo
              style={{ marginLeft: "auto", marginBottom: "0.8em", objectPosition: "right center" }}
            />
          )}
          <span
            style={{
              display: "inline-block",
              padding: "0.3em 0.8em",
              borderRadius: "0.4em",
              background: "var(--doc-primary-soft)",
              color: "var(--doc-primary)",
              fontWeight: 700,
              fontSize: "0.82em",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {vm.title}
          </span>
          <div
            className="doc-num"
            style={{ fontSize: "1.5em", fontWeight: 750, marginTop: "0.4em" }}
          >
            {vm.number}
          </div>
          <div style={{ marginTop: "0.5em" }}>
            <MetaList skipNumber align="right" exclude={["Reference", "PO No."]} />
          </div>
        </div>
      </div>

      {(reference || po) && (
        <div
          style={{
            marginTop: "1.3em",
            padding: "0.7em 1em",
            borderLeft: "3px solid var(--doc-accent)",
            background: "var(--doc-surface)",
            borderRadius: "0 0.45em 0.45em 0",
            display: "flex",
            gap: "2.5em",
            flexWrap: "wrap",
          }}
        >
          {reference && (
            <div>
              <div className="doc-label">Project / Reference</div>
              <div style={{ fontWeight: 650, fontSize: "1.08em" }}>{reference}</div>
            </div>
          )}
          {po && (
            <div>
              <div className="doc-label">Purchase order</div>
              <div style={{ fontWeight: 650, fontSize: "1.08em" }}>{po}</div>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: "1.3em",
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr" : "1fr",
          gap: "1.5em",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <SectionTitle>Client</SectionTitle>
          <CustomerDetails />
        </div>
        {ship && (
          <div style={{ minWidth: 0 }}>
            <SectionTitle>Service location</SectionTitle>
            <ShipToDetails />
          </div>
        )}
      </div>
    </div>
  );
}

export const serviceTemplate: DocumentTemplate = {
  id: "service",
  Header,
  ContinuationHeader: () => <ContinuationBar />,
  columnLabels: { item: "Service", qty: "Hrs / Qty", price: "Rate" },
  sections: { totals: () => <TotalsSection variant="accent" /> },
};
