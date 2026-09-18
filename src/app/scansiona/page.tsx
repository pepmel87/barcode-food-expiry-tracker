import { ScanFlow } from "@/components/ScanFlow";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Scansiona prodotto</h1>
        <p className="text-sm text-slate-500">
          Inquadra il codice a barre: il prodotto viene cercato nel database e online, poi inserisci la data di scadenza.
        </p>
      </div>
      <ScanFlow />
    </>
  );
}
