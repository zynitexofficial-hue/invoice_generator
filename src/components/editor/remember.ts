"use client";

import { getDb } from "@/db/db";
import { saveCustomer } from "@/db/records";
import { loadSettings, updateSettings } from "@/db/settings";
import { normalizeGstin } from "@/lib/gst/gstin";
import type { Invoice } from "@/lib/schema";

export interface Remembered {
  profile: boolean;
  customerId: string | null;
  customerAdded: boolean;
}

/** Text blocks that carry over from the last document you edited to the next one. */
export const CARRY_OVER_TEXT = ["notes", "terms", "paymentInstructions", "footer"] as const;

/** Make this document's notes, terms, payment instructions and footer the defaults for new ones. */
export async function rememberTexts(invoice: Invoice): Promise<void> {
  const settings = await loadSettings();
  const d = settings.invoiceDefaults;
  if (CARRY_OVER_TEXT.every((k) => d[k] === invoice[k])) return;
  await updateSettings((s) => ({
    ...s,
    invoiceDefaults: {
      ...s.invoiceDefaults,
      notes: invoice.notes,
      terms: invoice.terms,
      paymentInstructions: invoice.paymentInstructions,
      footer: invoice.footer,
    },
  }));
}

/**
 * Make this document's template and design settings the starting design for new
 * documents. It replaces any saved design marked as default: the last change wins.
 */
export async function rememberDesign(invoice: Invoice): Promise<void> {
  await updateSettings((s) => ({
    ...s,
    design: { defaultDesignId: "", fallback: structuredClone(invoice.design) },
  }));
}

/**
 * Remember details so nobody types them twice. Runs when a document is
 * downloaded (details are complete by then, unlike mid-typing autosaves):
 * - the seller becomes the business profile if none is saved yet;
 * - the customer is linked to a matching saved customer, or saved as new.
 */
export async function rememberParties(invoice: Invoice): Promise<Remembered> {
  const result: Remembered = { profile: false, customerId: null, customerAdded: false };

  const settings = await loadSettings();
  if (!settings.profile.name.trim() && invoice.seller.name.trim()) {
    await updateSettings((s) => ({ ...s, profile: structuredClone(invoice.seller) }));
    result.profile = true;
  }

  const c = invoice.customer;
  if (!c.customerId && c.name.trim()) {
    const name = c.name.trim().toLowerCase();
    const gstin = normalizeGstin(c.gstin);
    const match = await getDb()
      .customers.filter(
        (x) => x.name.trim().toLowerCase() === name && normalizeGstin(x.gstin) === gstin,
      )
      .first();
    if (match) {
      result.customerId = match.id;
    } else {
      // The schema drops the invoice-only customerId field.
      const saved = await saveCustomer({ ...c, name: c.name.trim() });
      result.customerId = saved.id;
      result.customerAdded = true;
    }
  }
  return result;
}
