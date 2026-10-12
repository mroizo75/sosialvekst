"use client";

import { useId } from "react";

import Link from "next/link";

import { useI18n } from "@/components/i18n/I18nProvider";
import type { Product } from "@/lib/types";

type ProductPickerProps = {
  products: Product[];
  value: string | null;
  onChange: (productId: string | null) => void;
  disabled?: boolean;
};

export const ProductPicker = ({ products, value, onChange, disabled }: ProductPickerProps) => {
  const { dictionary } = useI18n();
  const p = dictionary.products;
  const selectId = useId();

  if (products.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {p.pickerNoProducts}{" "}
        <Link href="/produkter" className="font-medium text-primary hover:underline">
          {p.manage}
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-foreground">
        {p.pickerLabel}
      </label>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="">{p.pickerNone}</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.images.length > 0 ? product.name : `${product.name} (${p.noImages.toLowerCase()})`}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{p.pickerHint}</p>
    </div>
  );
};
