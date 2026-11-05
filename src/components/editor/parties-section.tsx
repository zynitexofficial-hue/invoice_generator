"use client";

/* eslint-disable @next/next/no-img-element -- data URLs from local uploads */

import { AlertCircle, Building, Check, GitMerge, RotateCcw, Save, UserPlus, UserRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useCustomers } from "@/db/hooks";
import { saveCustomer } from "@/db/records";
import { updateSettings } from "@/db/settings";
import { DOC_TYPE_META } from "@/lib/documents";
import { checkGstin, normalizeGstin, stateFromGstin, PAN_PATTERN } from "@/lib/gst/gstin";
import { stateLabel } from "@/lib/gst/states";
import { customerStateCode, isIndia, sellerStateCode } from "@/lib/gst/tax";
import { toInvoiceCustomer } from "@/lib/invoice-factory";
import type { InvoiceCustomer, Seller } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { useEditor } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Collapse } from "@/components/ui/collapse";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { StateSelect } from "@/components/forms/pickers";
import { ImageUpload } from "@/components/forms/image-upload";
import { useEditorContext, useFieldIssue } from "./editor-context";
import { useEditorActions } from "./use-editor-actions";
import { AddFieldLink, EditorSection, useRevealOn } from "./section";

/* ---------------- Seller ---------------- */

export function SellerSection() {
  const { settings } = useEditorContext();
  const seller = useEditor((s) => s.invoice!.seller);
  const patchSeller = useEditor((s) => s.patchSeller);
  const { refreshBusinessCode } = useEditorActions();
  const nameIssue = useFieldIssue(fieldId.sellerName);
  const gstinIssue = useFieldIssue(fieldId.sellerGstin);
  const stateIssue = useFieldIssue(fieldId.sellerState);
  const filled = Boolean(seller.name.trim());

  const [logoOpen, setLogoOpen] = useState(false);
  const [panOpen, setPanOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);

  useRevealOn([fieldId.sellerPan], () => setPanOpen(true));

  const panInvalid = Boolean(seller.pan && !PAN_PATTERN.test(seller.pan));

  const setGstin = (raw: string) => {
    const gstin = normalizeGstin(raw);
    const derived = stateFromGstin(gstin);
    patchSeller({
      gstin,
      ...(gstin.length >= 2 && derived && !seller.stateCode ? { stateCode: derived } : {}),
    });
  };

  const fromProfile = () => {
    patchSeller(structuredClone(settings.profile));
    toast.success("Loaded your business profile");
  };
  const saveToProfile = async () => {
    await updateSettings((s) => ({ ...s, profile: structuredClone(seller) }));
    toast.success("Business profile updated", {
      description: "New documents will use these details.",
    });
  };

  return (
    <EditorSection
      title="From"
      icon={<Building />}
      collapsible
      defaultOpen={!filled}
      done={filled}
      hasIssue={Boolean(nameIssue.error || gstinIssue.warning || stateIssue.warning)}
      fields={[fieldId.sellerName, fieldId.sellerGstin, fieldId.sellerPan, fieldId.sellerState]}
      summary={[seller.name, seller.gstin].filter(Boolean).join(" · ") || "Your business details"}
    >
      <div className="grid gap-2.5 sm:gap-3">
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Business name" required id={fieldId.sellerName} error={nameIssue.error}>
            <Input
              value={seller.name}
              onChange={(e) => patchSeller({ name: e.target.value })}
              onBlur={() => void refreshBusinessCode()}
              maxLength={160}
              autoComplete="organization"
            />
          </Field>
          <Field label="GSTIN" optional id={fieldId.sellerGstin} warning={gstinIssue.warning}>
            <Input
              value={seller.gstin}
              onChange={(e) => setGstin(e.target.value)}
              maxLength={15}
              className="font-mono tracking-wide uppercase"
              placeholder="27ABCDE1234F1Z5"
              spellCheck={false}
            />
          </Field>
        </div>
        <Field label="Address">
          <Textarea
            value={seller.address}
            onChange={(e) => patchSeller({ address: e.target.value })}
            rows={2}
            maxLength={500}
            autoComplete="street-address"
          />
        </Field>
        {/* Phones: State, then Phone | Email side by side, then Website. Desktop: two even rows. */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <Field
            label="State"
            id={fieldId.sellerState}
            warning={stateIssue.warning}
            className="col-span-2 sm:col-span-1"
          >
            <StateSelect
              value={seller.stateCode}
              onChange={(code) => patchSeller({ stateCode: code })}
            />
          </Field>
          <Field label="Phone" optional>
            <Input
              value={seller.phone}
              onChange={(e) => patchSeller({ phone: e.target.value })}
              type="tel"
              maxLength={40}
            />
          </Field>
          <Field label="Email" optional>
            <Input
              value={seller.email}
              onChange={(e) => patchSeller({ email: e.target.value })}
              type="email"
              maxLength={160}
            />
          </Field>
          <Field label="Website" optional className="col-span-2 sm:col-span-1">
            <Input
              value={seller.website}
              onChange={(e) => patchSeller({ website: e.target.value })}
              maxLength={160}
            />
          </Field>
        </div>

        {/* Compact Logo, PAN, Signature actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {/* Logo pill or link */}
          {seller.logo && !logoOpen ? (
            <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2/80 px-2 text-xs font-medium text-foreground">
              <img src={seller.logo} alt="" className="size-4 rounded object-contain" />
              <span>Logo</span>
              <button
                type="button"
                onClick={() => setLogoOpen(true)}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => patchSeller({ logo: "" })}
                className="rounded p-0.5 text-muted-foreground hover:text-danger"
                title="Remove logo"
                aria-label="Remove logo"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : !logoOpen ? (
            <AddFieldLink onClick={() => setLogoOpen(true)}>Logo</AddFieldLink>
          ) : null}

          {/* PAN pill or link */}
          {seller.pan && !panOpen ? (
            <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2/80 px-2.5 font-mono text-xs font-medium text-foreground">
              <span className="font-sans text-[11px] text-muted-foreground">PAN:</span>
              <span>{seller.pan}</span>
              <button
                type="button"
                onClick={() => setPanOpen(true)}
                className="font-sans text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => patchSeller({ pan: "" })}
                className="rounded p-0.5 text-muted-foreground hover:text-danger"
                title="Remove PAN"
                aria-label="Remove PAN"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : !panOpen ? (
            <AddFieldLink onClick={() => setPanOpen(true)}>PAN</AddFieldLink>
          ) : null}

          {/* Signature pill or link */}
          {seller.signature && !signatureOpen ? (
            <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2/80 px-2 text-xs font-medium text-foreground">
              <img src={seller.signature} alt="" className="size-4 rounded bg-white/60 object-contain" />
              <span>
                Signature{seller.signatoryName ? ` (${seller.signatoryName})` : ""}
              </span>
              <button
                type="button"
                onClick={() => setSignatureOpen(true)}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => patchSeller({ signature: "", signatoryName: "" })}
                className="rounded p-0.5 text-muted-foreground hover:text-danger"
                title="Remove signature"
                aria-label="Remove signature"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : !signatureOpen ? (
            <AddFieldLink onClick={() => setSignatureOpen(true)}>Signature</AddFieldLink>
          ) : null}
        </div>

        {/* Collapsible Logo editor */}
        <Collapse open={logoOpen}>
          <div className="space-y-2 rounded-xl border border-border/80 bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Business logo</span>
              <div className="flex items-center gap-2">
                {seller.logo && (
                  <button
                    type="button"
                    onClick={() => {
                      patchSeller({ logo: "" });
                      setLogoOpen(false);
                    }}
                    className="text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setLogoOpen(false)}
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Done
                </Button>
              </div>
            </div>
            <ImageUpload
              label="Logo"
              value={seller.logo}
              onChange={(logo) => patchSeller({ logo })}
              hint="Square or wide · PNG, JPG, WebP or SVG"
            />
          </div>
        </Collapse>

        {/* Collapsible PAN editor */}
        <Collapse open={panOpen}>
          <div className="space-y-2 rounded-xl border border-border/80 bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">PAN card</span>
              <div className="flex items-center gap-2">
                {seller.pan && (
                  <button
                    type="button"
                    onClick={() => {
                      patchSeller({ pan: "" });
                      setPanOpen(false);
                    }}
                    className="text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPanOpen(false)}
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Done
                </Button>
              </div>
            </div>
            <Field
              label="Permanent Account Number (PAN)"
              optional
              id={fieldId.sellerPan}
              warning={panInvalid ? "PAN format looks incorrect (e.g. ABCDE1234F)." : undefined}
              hint={seller.pan && !panInvalid ? "Looks valid ✓" : "10-character alphanumeric PAN"}
            >
              <Input
                value={seller.pan}
                onChange={(e) =>
                  patchSeller({ pan: e.target.value.toUpperCase().replace(/\s/g, "") })
                }
                maxLength={10}
                className="font-mono uppercase tracking-wide"
                placeholder="ABCDE1234F"
                spellCheck={false}
              />
            </Field>
          </div>
        </Collapse>

        {/* Collapsible Signature editor */}
        <Collapse open={signatureOpen}>
          <div className="space-y-3 rounded-xl border border-border/80 bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Signature</span>
              <div className="flex items-center gap-2">
                {(seller.signature || seller.signatoryName) && (
                  <button
                    type="button"
                    onClick={() => {
                      patchSeller({ signature: "", signatoryName: "" });
                      setSignatureOpen(false);
                    }}
                    className="text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setSignatureOpen(false)}
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Done
                </Button>
              </div>
            </div>
            <ImageUpload
              label="Signature"
              value={seller.signature}
              onChange={(signature) => patchSeller({ signature })}
              hint="Transparent PNG works best"
            />
            <Field label="Signatory name" optional hint="Printed under the signature line">
              <Input
                value={seller.signatoryName}
                onChange={(e) => patchSeller({ signatoryName: e.target.value })}
                maxLength={120}
                placeholder="e.g. Authorized Signatory"
              />
            </Field>
          </div>
        </Collapse>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={fromProfile}>
            <RotateCcw />
            Load profile
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void saveToProfile()}>
            <Save />
            Save as profile
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {settings.profile.name.trim()
            ? "Logo, signature, and PAN can be set or changed above for this document, and saved to your profile anytime."
            : "These details become your business profile when you download — you won't have to type them again. Add a logo, signature or PAN anytime."}
        </p>
      </div>
    </EditorSection>
  );
}

/* ---------------- Customer ---------------- */

const EMPTY_CUSTOMER: InvoiceCustomer = {
  customerId: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  billingAddress: "",
  shippingAddress: "",
  stateCode: "",
  country: "India",
  gstin: "",
};

export function CustomerSection() {
  const customers = useCustomers() ?? [];
  const customer = useEditor((s) => s.invoice!.customer);
  const { docType, gstMode, placeOfSupply, seller } = useEditor(
    useShallow((s) => ({
      docType: s.invoice!.docType,
      gstMode: s.invoice!.gstMode,
      placeOfSupply: s.invoice!.placeOfSupply,
      seller: s.invoice!.seller as Seller,
    })),
  );
  const patchCustomer = useEditor((s) => s.patchCustomer);
  const patch = useEditor((s) => s.patch);
  const nameIssue = useFieldIssue(fieldId.customerName);
  const gstinIssue = useFieldIssue(fieldId.customerGstin);
  const posIssue = useFieldIssue(fieldId.placeOfSupply);
  // Optional groups stay behind "+ Add" links, but open whenever they hold data or a problem.
  const [show, setShow] = useState(HIDDEN_GROUPS);
  const reveal = (key: keyof typeof HIDDEN_GROUPS) => setShow((v) => ({ ...v, [key]: true }));
  const companyOpen = show.company || Boolean(customer.company);
  const contactOpen = show.contact || Boolean(customer.email || customer.phone);
  const shipOpen = show.ship || Boolean(customer.shippingAddress);
  const posOpen = show.pos || Boolean(placeOfSupply) || Boolean(posIssue.warning);
  useRevealOn([fieldId.placeOfSupply], () => reveal("pos"));
  const [saving, setSaving] = useState(false);
  const linked = customers.find((c) => c.id === customer.customerId);
  const [skippedForCustomerId, setSkippedForCustomerId] = useState<string | null>(null);
  const isSkipped = Boolean(linked && skippedForCustomerId === customer.customerId);

  const india = isIndia(customer.country);
  const showPos = DOC_TYPE_META[docType].hasTax && gstMode === "split";

  const setGstin = (raw: string) => {
    const gstin = normalizeGstin(raw);
    const derived = stateFromGstin(gstin);
    patchCustomer({
      gstin,
      ...(derived && checkGstin(gstin).valid && !customer.stateCode ? { stateCode: derived } : {}),
    });
  };

  const changedFromSaved =
    linked &&
    (
      [
        "name",
        "company",
        "email",
        "phone",
        "billingAddress",
        "shippingAddress",
        "stateCode",
        "country",
        "gstin",
      ] as const
    ).some((k) => (linked[k] ?? "") !== (customer[k] ?? ""));

  const handleCreateNewCustomer = async () => {
    if (!customer.name.trim()) {
      toast.error("Add the customer's name first");
      return;
    }
    setSaving(true);
    try {
      const { customerId: _, ...fields } = customer;
      void _;
      const record = await saveCustomer({
        ...fields,
        name: fields.name.trim(),
      });
      patchCustomer({ customerId: record.id });
      setSkippedForCustomerId(null);
      toast.success("Saved as new customer", {
        description: `Created new customer record "${record.name}".`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMergeCustomer = async () => {
    if (!customer.name.trim()) {
      toast.error("Add the customer's name first");
      return;
    }
    setSaving(true);
    try {
      const { customerId, ...fields } = customer;
      const record = await saveCustomer({
        ...(linked ?? {}),
        ...fields,
        name: fields.name.trim(),
        id: customerId || undefined,
      });
      patchCustomer({ customerId: record.id });
      setSkippedForCustomerId(null);
      toast.success("Customer record updated", {
        description: `Updated saved details for "${record.name}".`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSkipChange = () => {
    setSkippedForCustomerId(customer.customerId);
    toast.success("Kept changes for this invoice only (saved customer not updated)");
  };

  const handleRevertCustomer = () => {
    if (linked) {
      patchCustomer(toInvoiceCustomer(linked));
      toast.success("Reverted to saved customer details");
    }
  };

  const handleSaveUnlinkedCustomer = async () => {
    if (!customer.name.trim()) {
      toast.error("Add the customer's name first");
      return;
    }
    setSaving(true);
    try {
      const { customerId: _, ...fields } = customer;
      void _;
      const record = await saveCustomer({
        ...fields,
        name: fields.name.trim(),
      });
      patchCustomer({ customerId: record.id });
      toast.success("Saved to your customers");
    } finally {
      setSaving(false);
    }
  };

  const autoPos = customerStateCode(customer);
  const sellerState = sellerStateCode(seller);
  const effectivePos = placeOfSupply || autoPos;
  const taxResult =
    sellerState && effectivePos ? (effectivePos === sellerState ? "CGST + SGST" : "IGST") : "";

  return (
    <EditorSection
      title="Bill to"
      icon={<UserRound />}
      done={Boolean(customer.name.trim())}
      action={
        customers.length > 0 ? (
          <Combobox
            items={customers}
            getKey={(c) => c.id}
            getLabel={(c) => c.name}
            getDescription={(c) =>
              [c.company, c.gstin, c.email].filter(Boolean).join(" · ") || stateLabel(c.stateCode)
            }
            getKeywords={(c) => [c.company, c.gstin, c.email].filter(Boolean)}
            selectedKey={customer.customerId}
            onSelect={(c) => {
              patchCustomer(toInvoiceCustomer(c));
              patch({ placeOfSupply: "" });
              setSkippedForCustomerId(null);
            }}
            align="end"
            searchPlaceholder="Search customers…"
            emptyText="No customers match"
            trigger={
              <Button size="sm" variant="secondary">
                <UserPlus />
                Choose saved
              </Button>
            }
          />
        ) : undefined
      }
    >
      <div className="grid gap-2.5 sm:gap-3">
        {linked && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft/60 px-3 py-1.5 text-[13px] text-primary-soft-foreground">
            <span className="flex items-center gap-2">
              <Check className="size-4" />
              Saved customer: <strong className="font-semibold">{linked.name}</strong>
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                patchCustomer({ ...EMPTY_CUSTOMER });
                patch({ placeOfSupply: "" });
                setShow(HIDDEN_GROUPS);
                setSkippedForCustomerId(null);
              }}
            >
              <X />
              Clear
            </Button>
          </div>
        )}

        {linked && changedFromSaved && !isSkipped && (
          <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft/30 p-3 text-[13px] text-foreground">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-warning-foreground">
                <AlertCircle className="size-4 shrink-0 text-warning" />
                <span>Customer details modified</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleRevertCustomer}
                title="Discard edits and revert to saved customer details"
              >
                <RotateCcw className="mr-1 size-3" />
                Revert
              </Button>
            </div>
            <p className="text-xs leading-normal text-muted-foreground">
              These details differ from the saved profile for <strong>{linked.name}</strong>. Choose what to do with these changes:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                size="xs"
                variant="secondary"
                onClick={() => void handleCreateNewCustomer()}
                loading={saving}
              >
                <UserPlus className="mr-1 size-3.5" />
                Create new customer
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => void handleMergeCustomer()}
                loading={saving}
              >
                <GitMerge className="mr-1 size-3.5" />
                Merge with {linked.name}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={handleSkipChange}
              >
                Skip change (this invoice only)
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Customer name" required id={fieldId.customerName} error={nameIssue.error}>
            <Input
              value={customer.name}
              onChange={(e) => patchCustomer({ name: e.target.value })}
              maxLength={160}
              placeholder="Person or business"
            />
          </Field>
          {india && (
            <Field label="GSTIN" optional id={fieldId.customerGstin} warning={gstinIssue.warning}>
              <Input
                value={customer.gstin}
                onChange={(e) => setGstin(e.target.value)}
                maxLength={15}
                className="font-mono tracking-wide uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
                placeholder="For GST-registered buyers"
                spellCheck={false}
              />
            </Field>
          )}
        </div>
        <Collapse open={companyOpen}>
          <Field label="Company" optional>
            <Input
              value={customer.company}
              onChange={(e) => patchCustomer({ company: e.target.value })}
              maxLength={160}
            />
          </Field>
        </Collapse>
        <Field label="Billing address">
          <Textarea
            value={customer.billingAddress}
            onChange={(e) => patchCustomer({ billingAddress: e.target.value })}
            rows={2}
            maxLength={500}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {india && (
            <Field label="State">
              <StateSelect
                value={customer.stateCode}
                onChange={(code) => patchCustomer({ stateCode: code })}
              />
            </Field>
          )}
          <Field label="Country" className={india ? undefined : "col-span-2"}>
            <Input
              value={customer.country}
              onChange={(e) => patchCustomer({ country: e.target.value })}
              maxLength={80}
              autoComplete="country-name"
            />
          </Field>
        </div>

        {showPos &&
          (posOpen ? (
            <Field
              label="Place of supply"
              id={fieldId.placeOfSupply}
              warning={posIssue.warning}
              hint={taxResult ? `→ ${taxResult}` : "Decides CGST + SGST or IGST."}
            >
              <StateSelect
                value={placeOfSupply}
                onChange={(code) => patch({ placeOfSupply: code })}
                allowOutsideIndia
                autoLabel={
                  autoPos
                    ? `Auto — ${stateLabel(autoPos) || "Outside India"}`
                    : "Auto — from customer's state"
                }
              />
            </Field>
          ) : (
            <div className="flex min-h-9 items-center justify-between gap-3 rounded-lg bg-surface-2/70 py-1 pr-1 pl-3 text-[13px]">
              <span className="min-w-0 text-muted-foreground">
                Place of supply{" "}
                <span className="font-medium text-foreground">
                  {autoPos ? stateLabel(autoPos) || "Outside India" : "Auto"}
                </span>
                {taxResult && <span> → {taxResult}</span>}
              </span>
              <Button variant="ghost" size="xs" onClick={() => reveal("pos")}>
                Change
              </Button>
            </div>
          ))}

        <Collapse open={contactOpen}>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <Field label="Email" optional>
              <Input
                value={customer.email}
                onChange={(e) => patchCustomer({ email: e.target.value })}
                type="email"
                maxLength={160}
              />
            </Field>
            <Field label="Phone" optional>
              <Input
                value={customer.phone}
                onChange={(e) => patchCustomer({ phone: e.target.value })}
                type="tel"
                maxLength={40}
              />
            </Field>
          </div>
        </Collapse>
        <Collapse open={shipOpen}>
          <Field
            label="Shipping address"
            action={
              <button
                type="button"
                onClick={() => {
                  setShow((v) => ({ ...v, ship: false }));
                  patchCustomer({ shippingAddress: "" });
                }}
                className="rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:focus-ring"
              >
                Remove
              </button>
            }
          >
            <Textarea
              value={customer.shippingAddress}
              onChange={(e) => patchCustomer({ shippingAddress: e.target.value })}
              rows={2}
              maxLength={500}
              placeholder="If different from the billing address"
            />
          </Field>
        </Collapse>

        {/* Optional fields and the save action share one row to keep the card short. */}
        {(!companyOpen || !contactOpen || !shipOpen || !linked || (changedFromSaved && isSkipped)) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!companyOpen && <AddFieldLink onClick={() => reveal("company")}>Company</AddFieldLink>}
            {!contactOpen && (
              <AddFieldLink onClick={() => reveal("contact")}>Email / phone</AddFieldLink>
            )}
            {!shipOpen && (
              <AddFieldLink onClick={() => reveal("ship")}>Shipping address</AddFieldLink>
            )}
            {linked && changedFromSaved && isSkipped && (
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span>Invoice-only changes</span>
                <button
                  type="button"
                  onClick={() => setSkippedForCustomerId(null)}
                  className="underline hover:text-foreground"
                >
                  Options
                </button>
              </div>
            )}
            {!linked && (
              <Tooltip content="New customers are also saved when you download">
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => void handleSaveUnlinkedCustomer()}
                  loading={saving}
                  disabled={!customer.name.trim()}
                >
                  <Save />
                  Save customer
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </EditorSection>
  );
}

const HIDDEN_GROUPS = { company: false, contact: false, ship: false, pos: false };
