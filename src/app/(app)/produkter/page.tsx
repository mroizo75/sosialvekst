import { ProductCatalog } from "@/components/products/ProductCatalog";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/get-locale";

export default async function ProductsPage() {
  const p = getDictionary(await getLocale()).products;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{p.pageTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.pageDescription}</p>
      </div>
      <div className="max-w-2xl">
        <ProductCatalog />
      </div>
    </>
  );
}
