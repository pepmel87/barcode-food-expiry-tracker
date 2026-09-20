"use client";

import { useState } from "react";

interface Props {
  src: string | null;
  alt: string;
  className?: string;
}

export function ProductImage({ src, alt, className = "" }: Props) {
  // Ricorda quale URL ha fallito: se cambia la prop, si riprova automaticamente
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc !== null && failedSrc === src;

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden bg-slate-100 text-slate-400 ${className}`}
        aria-label={alt}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-1/2 w-1/2">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
          <path d="M8 8v8M11 8v8M14 8v8M16.5 8v8" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`overflow-hidden bg-white object-contain ${className}`}
    />
  );
}
