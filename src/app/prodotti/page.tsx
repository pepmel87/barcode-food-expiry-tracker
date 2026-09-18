import { ProductCatalog } from "@/components/ProductCatalog";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Catalogo prodotti</h1>
        <p className="text-sm text-slate-500">
          Database locale dei prodotti scansionati: alla prossima scansione il riconoscimento è immediato.
        </p>
      </div>
      <ProductCatalog />
    </>
  );
}
