"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Attribute } from "@/lib/attributes";
import type { Category } from "@/lib/categories";
import type { StoreView } from "@/lib/stock";
import type { Unit } from "@/lib/uom";
import { InventoryItemDialog } from "./inventory-item-dialog";

type Props = { currency: string; pricesIncludeTax: boolean; categories: Category[]; attributes: Attribute[]; units: Unit[]; packsEnabled: boolean; fitment: boolean; storeView: StoreView };

export function AddItemButton({ currency, pricesIncludeTax, categories, attributes, units, packsEnabled, fitment, storeView }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add New Product
      </button>
      <InventoryItemDialog open={open} onOpenChange={setOpen} currency={currency} pricesIncludeTax={pricesIncludeTax} categories={categories} attributes={attributes} units={units} packsEnabled={packsEnabled} fitment={fitment} storeView={storeView} />
    </>
  );
}
