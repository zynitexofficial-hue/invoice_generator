"use client";

import {
  ContinuationBar,
  CustomerDetails,
  Logo,
  MetaList,
  SectionTitle,
  SellerDetails,
  ShipToDetails,
  useLogoPosition,
} from "../blocks";
import { useDoc } from "../context";
import type { DocumentTemplate } from "./types";

function Header() {
  const { vm } = useDoc();
  const logo = useLogoPosition();
  const ship = vm.customer.shipTo.length > 0;
  return (
    <div style={{ paddingBottom: "1.8em" }}>
      {logo === "center" && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.4em" }}>
          <Logo style={{ objectPosition: "center" }} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "2.5em",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {logo === "left" && <Logo style={{ marginBottom: "1em" }} />}
          <SellerDetails />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, maxWidth: "45%" }}>
          {logo === "right" && (
            <Logo
              style={{ marginLeft: "auto", marginBottom: "1em", objectPosition: "right center" }}
            />
          )}
          <div
            style={{
              fontSize: "2.35em",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            {vm.title}
          </div>
          <div className="doc-muted doc-num" style={{ marginTop: "0.45em", fontSize: "1.05em" }}>
            {vm.number}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--doc-border-strong)", margin: "1.7em 0 1.4em" }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr auto" : "1fr auto",
          gap: "2.2em",
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <SectionTitle>Billed to</SectionTitle>
          <CustomerDetails />
        </div>
        {ship && (
          <div style={{ minWidth: 0 }}>
            <SectionTitle>Ship to</SectionTitle>
            <ShipToDetails />
          </div>
        )}
        <MetaList skipNumber align="right" />
      </div>
    </div>
  );
}

export const minimalTemplate: DocumentTemplate = {
  id: "minimal",
  Header,
  ContinuationHeader: () => <ContinuationBar />,
};
