import type { Metadata } from "next";
import { PayView } from "@/components/pay/pay-view";

export const metadata: Metadata = {
  title: "Pay via UPI",
  description: "Open your UPI app to pay this invoice.",
  // Each link carries someone's payment details; none of these pages belong in search.
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return <PayView />;
}
