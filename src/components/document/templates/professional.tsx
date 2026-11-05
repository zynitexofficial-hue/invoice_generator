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
    <div style={{ paddingBottom: "1.6em" }}>
      {logo === "center" && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.2em" }}>
          <Logo style={{ objectPosition: "center" }} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "2em",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{ display: "flex", gap: "1em", alignItems: "flex-start", flex: 1, minWidth: 0 }}
        >
          {logo === "left" && <Logo />}
          <div style={{ minWidth: 0 }}>
            <SellerDetails />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {logo === "right" && (
            <Logo
              style={{ marginLeft: "auto", marginBottom: "0.8em", objectPosition: "right center" }}
            />
          )}
          <div
            style={{
              fontSize: "1.85em",
              fontWeight: 750,
              color: "var(--doc-primary)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            {vm.title}
          </div>
          <div
            className="doc-num"
            style={{ marginTop: "0.35em", fontWeight: 600, fontSize: "1.05em" }}
          >
            # {vm.number}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1.6em",
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr 1.05fr" : "1.4fr 1fr",
          gap: "1em",
          alignItems: "stretch",
        }}
      >
        <div
          className="doc-box"
          style={{ borderLeft: "3px solid var(--doc-primary)", minWidth: 0 }}
        >
          <SectionTitle>Bill to</SectionTitle>
          <CustomerDetails />
        </div>
        {ship && (
          <div className="doc-box" style={{ minWidth: 0 }}>
            <SectionTitle>Ship to</SectionTitle>
            <ShipToDetails />
          </div>
        )}
        <div
          className="doc-box"
          style={{ background: "var(--doc-primary-tint)", borderColor: "var(--doc-primary-line)" }}
        >
          <MetaList skipNumber />
          <div
            style={{
              marginTop: "0.6em",
              paddingTop: "0.55em",
              borderTop: "1px solid var(--doc-primary-line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "1em",
            }}
          >
            <span style={{ fontWeight: 600 }}>{vm.amountDueLabel}</span>
            <span
              className="doc-num"
              style={{ fontWeight: 750, fontSize: "1.2em", color: "var(--doc-primary)" }}
            >
              {vm.amountDue}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Decor() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: "1.5mm",
          background: "var(--doc-primary)",
        }}
      />
    </>
  );
}

export const professionalTemplate: DocumentTemplate = {
  id: "professional",
  Header,
  ContinuationHeader: () => <ContinuationBar />,
  Decor,
};
