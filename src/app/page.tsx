import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Scadenze</h1>
        <p className="text-sm text-slate-500">
          Freschi: avviso 3 giorni prima (7 con molti pezzi). Lunga conservazione: 15 giorni prima.
        </p>
      </div>
      <Dashboard />
    </>
  );
}
