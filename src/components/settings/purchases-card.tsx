"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/db/settings";
import type { AppSettings } from "@/lib/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Settings → Data: default credit period for vendors and purchase bills. */
export function PurchasesCard({ settings }: { settings: AppSettings }) {
  const days = settings.purchases.defaultPaymentDays;
  const [text, setText] = useState(String(days));
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      setText(String(days));
      toast.error("Payment days must be between 0 and 365.");
      return;
    }
    if (n !== days)
      void updateSettings((s) => ({ ...s, purchases: { ...s.purchases, defaultPaymentDays: n } }));
  };
  return (
    <Card>
      <CardHeader
        title="Purchase bills"
        description="Used for new vendors and for due dates on bills without a saved vendor."
        icon={<ShoppingCart />}
      />
      <CardContent>
        <Field label="Default payment days" hint="Days after the bill date that payment is due.">
          <Input
            inputMode="numeric"
            className="sm:w-40"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
            onBlur={commit}
          />
        </Field>
      </CardContent>
    </Card>
  );
}
