"use client";

import type { ReactNode } from "react";
import {
  ContinuationBar,
  CustomerDetails,
  Logo,
  MetaList,
  SellerDetails,
  ShipToDetails,
  SignatureSection,
  TotalsSection,
  useLogoPosition,
} from "../blocks";
import { useDoc } from "../context";
import type { DocumentTemplate } from "./types";

function Header() {
  const { vm } = useDoc();
  const logo = useLogoPosition();
  const ship = vm.customer.shipTo.length > 0;
  return (
    <div style={{ paddingBottom: "1.6em", paddingTop: "0.6em" }}>
      {logo === "center" && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.1em" }}>
          <Logo style={{ objectPosition: "center" }} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "2em",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", gap: "1em", alignItems: "center", flex: 1, minWidth: 0 }}>
          {logo === "left" && <Logo />}
          <div style={{ minWidth: 0 }}>
            <SellerDetails
              nameStyle={{
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--doc-primary)",
                fontSize: "1.3em",
              }}
              inlineTax
            />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {logo === "right" && (
            <Logo
              style={{ marginLeft: "auto", marginBottom: "0.7em", objectPosition: "right center" }}
            />
          )}
          <div
            style={{
              fontSize: "1.6em",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {vm.title}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1.3em",
          display: "grid",
          gridTemplateColumns: ship ? "1fr 1fr 1fr" : "1.3fr 1fr",
          border: "1px solid var(--doc-border-strong)",
          borderRadius: "0.3em",
          overflow: "hidden",
        }}
      >
        <Cell title="Bill to">
          <CustomerDetails />
        </Cell>
        {ship && (
          <Cell title="Ship to" divider>
            <ShipToDetails />
          </Cell>
        )}
        <Cell title="Document details" divider>
          <MetaList />
        </Cell>
      </div>
    </div>
  );
}

function Cell({
  title,
  children,
  divider,
}: {
  title: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        borderLeft: divider ? "1px solid var(--doc-border-strong)" : undefined,
      }}
    >
      <div
        className="doc-label"
        style={{
          background: "var(--doc-primary-soft)",
          color: "var(--doc-primary)",
          padding: "0.5em 0.9em",
          borderBottom: "1px solid var(--doc-border-strong)",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "0.75em 0.9em" }}>{children}</div>
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
          height: "2.6mm",
          background: "var(--doc-primary)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "2.6mm",
          left: 0,
          right: 0,
          height: "0.7mm",
          background: "var(--doc-accent)",
        }}
      />
    </>
  );
}

export const corporateTemplate: DocumentTemplate = {
  id: "corporate",
  Header,
  ContinuationHeader: () => <ContinuationBar style={{ marginTop: "0.6em" }} />,
  Decor,
  sections: {
    totals: () => <TotalsSection variant="boxed" />,
    signature: () => <SignatureSection boxed />,
  },
};
