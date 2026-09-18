import { NotificationCenter } from "@/components/NotificationCenter";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Notifiche</h1>
        <p className="text-sm text-slate-500">Avvisi di scadenza e promemoria per mettere i prodotti in offerta.</p>
      </div>
      <NotificationCenter />
    </>
  );
}
