import type { Metadata } from "next";
import { ReturnsView } from "@/components/returns/returns-view";

export const metadata: Metadata = { title: "GST Returns" };

export default function Page() {
  return <ReturnsView />;
}
