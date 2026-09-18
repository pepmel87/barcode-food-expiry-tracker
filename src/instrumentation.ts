/**
 * Scheduler autonomo: quando il server Next.js parte, esegue periodicamente il
 * controllo delle scadenze (notifiche in-app + Web Push) senza bisogno di cron esterni.
 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // ogni 10 minuti
const FIRST_RUN_DELAY_MS = 20 * 1000; // attende che il server sia pronto

declare global {
  var __expiryScheduler: NodeJS.Timeout | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalThis.__expiryScheduler) return;

  const run = async () => {
    try {
      const { runExpiryCheck } = await import("./lib/checker");
      const result = await runExpiryCheck();
      if (result.created > 0) {
        console.log(
          `[scadenze] controllo eseguito: ${result.created} nuovi avvisi, push inviate: ${result.push.sent}`,
        );
      }
    } catch (err) {
      console.error("[scadenze] errore durante il controllo periodico", err);
    }
  };

  const first = setTimeout(() => {
    void run();
    globalThis.__expiryScheduler = setInterval(() => void run(), CHECK_INTERVAL_MS);
    globalThis.__expiryScheduler.unref?.();
  }, FIRST_RUN_DELAY_MS);
  first.unref?.();
}
