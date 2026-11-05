"use client";

import { Copy, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { UPI_PATTERN } from "@/lib/gst/gstin";
import { toDec } from "@/lib/money";
import { buildUpiParams } from "@/lib/upi";
import { useMounted } from "@/hooks/use-mounted";
import { QrCodeSvg } from "@/components/document/qr-code";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** Payment details from the #fragment — they never reach a server. */
function usePayment() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  const q = new URLSearchParams(hash);
  const upiId = (q.get("pa") ?? "").trim();
  if (!UPI_PATTERN.test(upiId)) return null;
  const amount = q.get("am") ?? "";
  const payee = (q.get("pn") ?? "").slice(0, 50);
  const note = (q.get("tn") ?? "").slice(0, 80);
  // Rebuilt from known fields only, so the link can't smuggle in anything else.
  const params = buildUpiParams({
    upiId,
    payeeName: payee,
    amount: toDec(amount).greaterThan(0) ? amount : undefined,
    note,
  })!;
  return { upiId, payee, note, amount: toDec(amount).greaterThan(0) ? amount : "", params };
}

/** iPhones have no shared upi:// handler, so offer the popular apps directly. */
const IOS_APPS = [
  { name: "Google Pay", href: (p: string) => `gpay://upi/pay?${p}` },
  { name: "PhonePe", href: (p: string) => `phonepe://pay?${p}` },
  { name: "Paytm", href: (p: string) => `paytmmp://pay?${p}` },
];

export function PayView() {
  const mounted = useMounted();
  const payment = usePayment();
  const isIos =
    mounted &&
    (/iP(hone|od|ad)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select it and copy instead.");
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        {!mounted ? null : !payment ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-xs">
            <h1 className="text-lg font-semibold">This payment link is incomplete</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the sender for a fresh invoice, or pay using the bank or UPI details printed on
              it.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-xs">
            <p className="text-sm text-muted-foreground">Pay</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.02em] break-words">
              {payment.payee || payment.upiId}
            </h1>
            {payment.amount && (
              <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] tabular-nums">
                {formatMoney(payment.amount, "INR")}
              </p>
            )}
            {payment.note && <p className="mt-1 text-sm text-muted-foreground">{payment.note}</p>}

            <Button asChild size="lg" variant="primary" className="mt-6 w-full">
              <a href={`upi://pay?${payment.params}`}>
                <ExternalLink />
                Open UPI app
              </a>
            </Button>
            {isIos && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {IOS_APPS.map((app) => (
                  <Button key={app.name} asChild size="sm" variant="secondary">
                    <a href={app.href(payment.params)}>{app.name}</a>
                  </Button>
                ))}
              </div>
            )}

            <div
              role="note"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-3 text-left text-[13px] leading-5"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
              <p>
                <span className="font-semibold">Before you pay,</span> check the account name your
                UPI app shows.{" "}
                {payment.payee ? (
                  <>
                    It should be <span className="font-semibold">{payment.payee}</span>.
                  </>
                ) : (
                  "It should match the sender of your invoice."
                )}{" "}
                If it&apos;s different, don&apos;t pay — contact the sender first.
              </p>
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="rounded-xl bg-white p-2 shadow-sm">
                <QrCodeSvg value={`upi://pay?${payment.params}`} className="size-40" />
              </div>
              <p className="text-xs text-muted-foreground">On a computer? Scan with your phone.</p>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">UPI ID</p>
                <p className="truncate font-medium">{payment.upiId}</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Copy UPI ID"
                onClick={() => void copy(payment.upiId, "UPI ID")}
              >
                <Copy />
              </Button>
            </div>

            <p className="mt-5 flex items-start gap-2 text-left text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              This page only opens your UPI app — no payment passes through it.
            </p>
          </div>
        )}
        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Invoice made with <Brand className="scale-90" />
        </Link>
      </div>
    </main>
  );
}
