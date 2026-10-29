"use client";

import { useState } from "react";
import { ChevronDown, Layers, Package, Plus, Rows3 } from "lucide-react";
import type { Attribute } from "@/lib/attributes";
import type { Category } from "@/lib/categories";
import type { StoreView } from "@/lib/stock";
import type { Unit } from "@/lib/uom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InventoryItemDialog } from "./inventory-item-dialog";
import { ProductGroupDialog } from "./product-group-dialog";

type Props = { currency: string; pricesIncludeTax: boolean; categories: Category[]; attributes: Attribute[]; units: Unit[]; packsEnabled: boolean; fitment: boolean; storeView: StoreView };

/** Phase 21: add a product, a product with variants (sizes, colours…) or a kit (RF-21.1). */
export function AddItemButton({ currency, pricesIncludeTax, categories, attributes, units, packsEnabled, fitment, storeView }: Props) {
  const [adding, setAdding] = useState<"product" | "kit" | "group" | null>(null);
  const shared = { currency, pricesIncludeTax, categories, attributes, units, fitment, storeView };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="button button-primary">
            <Plus size={14} /> Add New Product <ChevronDown size={13} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-64 add-product-menu">
          <DropdownMenuItem onSelect={() => setAdding("product")}>
            <Package size={15} />
            <span><strong>Product</strong><small>One SKU with its own stock</small></span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAdding("group")}>
            <Rows3 size={15} />
            <span><strong>Product with variants</strong><small>Sizes, colours or styles, each with its own stock</small></span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAdding("kit")}>
            <Layers size={15} />
            <span><strong>Kit</strong><small>A bundle of products sold as one line</small></span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InventoryItemDialog
        open={adding === "product" || adding === "kit"}
        onOpenChange={(open) => !open && setAdding(null)}
        packsEnabled={packsEnabled}
        kit={adding === "kit"}
        {...shared}
      />
      <ProductGroupDialog open={adding === "group"} onOpenChange={(open) => !open && setAdding(null)} {...shared} />
    </>
  );
}
