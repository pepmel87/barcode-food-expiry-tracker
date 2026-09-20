"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

interface Props {
  active: boolean;
  onDetected: (code: string) => void;
}

type Engine = "native" | "zxing" | null;

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1400;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore */
  }
}

export function BarcodeScanner({ active, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>(null);
  const [starting, setStarting] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const lastRead = useRef<{ code: string; at: number } | null>(null);
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const handleRead = useCallback((raw: string) => {
    if (doneRef.current) return;
    const code = raw.replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(code.length)) return;
    const now = Date.now();
    const prev = lastRead.current;
    // Richiede due letture identiche ravvicinate per evitare falsi positivi
    if (prev && prev.code === code && now - prev.at < 2000) {
      doneRef.current = true;
      lastRead.current = null;
      navigator.vibrate?.(120);
      beep();
      onDetectedRef.current(code);
    } else {
      lastRead.current = { code, at: now };
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    doneRef.current = false;
    setError(null);
    setStarting(true);

    const video = videoRef.current;
    if (!video) return;

    const cleanupFns: Array<() => void> = [];
    stopRef.current = () => {
      for (const fn of cleanupFns.splice(0)) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      trackRef.current = null;
    };

    const setupTorch = (stream: MediaStream | null) => {
      const track = stream?.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(Boolean(caps?.torch));
    };

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    async function startNative(): Promise<boolean> {
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Ctor) return false;
      let supported: string[] = [];
      try {
        supported = await Ctor.getSupportedFormats();
      } catch {
        return false;
      }
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (!formats.includes("ean_13")) return false;

      const detector = new Ctor({ formats });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return true;
      }
      video!.srcObject = stream;
      video!.setAttribute("playsinline", "true");
      await video!.play().catch(() => undefined);
      setupTorch(stream);

      let timer: ReturnType<typeof setTimeout> | null = null;
      let running = true;
      const loop = async () => {
        if (!running || cancelled) return;
        if (video!.readyState >= 2 && !doneRef.current) {
          try {
            const codes = await detector.detect(video!);
            for (const c of codes) handleRead(c.rawValue);
          } catch {
            /* frame non decodificabile */
          }
        }
        timer = setTimeout(loop, 120);
      };
      void loop();
      cleanupFns.push(() => {
        running = false;
        if (timer) clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        if (video) video.srcObject = null;
      });
      setEngine("native");
      return true;
    }

    async function startZxing() {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 400,
      });
      const controls = await reader.decodeFromConstraints(constraints, video!, (result) => {
        if (result) handleRead(result.getText());
      });
      if (cancelled) {
        controls.stop();
        return;
      }
      setupTorch((video!.srcObject as MediaStream | null) ?? null);
      cleanupFns.push(() => {
        controls.stop();
        if (video) video.srcObject = null;
      });
      setEngine("zxing");
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Fotocamera non disponibile su questo browser. Inserisci il codice manualmente.");
        }
        const ok = await startNative();
        if (!ok && !cancelled) await startZxing();
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Permesso fotocamera negato. Consenti l'accesso alla fotocamera nelle impostazioni del browser oppure inserisci il codice manualmente.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("Nessuna fotocamera trovata. Inserisci il codice manualmente.");
        } else {
          setError((err as Error)?.message || "Impossibile avviare la fotocamera.");
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current();
      setTorchOn(false);
    };
  }, [active, handleRead]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black shadow-inner">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay />
      {active && !error ? (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[38%] w-[78%] rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-emerald-400" />
              <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-emerald-400" />
              <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-emerald-400" />
              <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-emerald-400" />
              <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-red-500/80" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2 text-[11px] text-white/80">
            <span>{starting ? "Avvio fotocamera…" : "Inquadra il codice a barre"}</span>
            <span className="rounded bg-white/15 px-1.5 py-0.5 uppercase tracking-wide">
              {engine === "native" ? "Nativo" : engine === "zxing" ? "ZXing" : ""}
            </span>
          </div>
          {torchSupported ? (
            <button
              type="button"
              onClick={toggleTorch}
              className={`absolute right-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold shadow ${
                torchOn ? "bg-amber-400 text-slate-900" : "bg-white/90 text-slate-800"
              }`}
            >
              {torchOn ? "Torcia ON" : "Torcia"}
            </button>
          ) : null}
        </>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-6 text-center text-sm text-white">
          <p>{error}</p>
        </div>
      ) : null}
      {!active && !error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-sm text-white/80">
          Fotocamera in pausa
        </div>
      ) : null}
    </div>
  );
}
