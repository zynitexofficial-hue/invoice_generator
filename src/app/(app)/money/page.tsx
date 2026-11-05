import type { Metadata } from "next";
import { MoneyView } from "@/components/money/money-view";

export const metadata: Metadata = { title: "Money" };

export default function Page() {
  return <MoneyView />;
}
