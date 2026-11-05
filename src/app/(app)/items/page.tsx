import type { Metadata } from "next";
import { ItemsView } from "@/components/items/items-view";

export const metadata: Metadata = { title: "Items" };

export default function ItemsPage() {
  return <ItemsView />;
}
