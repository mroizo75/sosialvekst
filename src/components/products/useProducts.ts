"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/lib/types";

export const useProducts = (enabled = true): { products: Product[]; loaded: boolean } => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/products");
        if (!response.ok) return;
        const data = (await response.json()) as { products?: Product[] };
        if (active) setProducts(data.products ?? []);
      } catch {
        /* the picker falls back to "no product" */
      } finally {
        if (active) setLoaded(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [enabled]);

  return { products, loaded };
};
