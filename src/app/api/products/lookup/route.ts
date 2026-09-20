import { db } from "@/db";
import { products } from "@/db/schema";
import { toProductDTO } from "@/lib/batches";
import {
  eanVariants,
  googleLinks,
  isGoogleConfigured,
  isValidGTINChecksum,
  lookupExternal,
  normalizeEAN,
} from "@/lib/lookup";
import type { LookupResponse } from "@/lib/types";
import { inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ean") ?? "";
  const ean = normalizeEAN(raw);
  if (!ean) {
    return NextResponse.json({ error: "Codice EAN non valido (attese 8, 12, 13 o 14 cifre)." }, { status: 400 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const checksumValid = isValidGTINChecksum(ean);
  const links = googleLinks(ean);
  const googleConfigured = isGoogleConfigured();

  // 1) Database locale (anche con varianti UPC-A / EAN-13)
  if (!refresh) {
    const local = await db.select().from(products).where(inArray(products.ean, eanVariants(ean))).limit(1);
    if (local.length) {
      const body: LookupResponse = {
        found: true,
        ean,
        source: "local",
        product: toProductDTO(local[0]),
        checksumValid,
        googleConfigured,
        links,
      };
      return NextResponse.json(body);
    }
  }

  // 2) Sorgenti esterne (Open Food Facts -> UPCitemdb -> Google)
  const external = await lookupExternal(ean);
  if (!external) {
    const body: LookupResponse = {
      found: false,
      ean,
      source: null,
      product: null,
      checksumValid,
      googleConfigured,
      links,
    };
    return NextResponse.json(body);
  }

  // 3) Salva/aggiorna nel catalogo locale
  const now = new Date();
  const [saved] = await db
    .insert(products)
    .values({
      ean,
      name: external.name,
      brand: external.brand,
      description: external.description,
      imageUrl: external.imageUrl,
      category: external.category,
      quantity: external.quantity,
      storageType: external.storageType,
      source: external.source,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: products.ean,
      set: {
        name: external.name,
        brand: external.brand,
        description: external.description,
        imageUrl: external.imageUrl,
        category: external.category,
        quantity: external.quantity,
        source: external.source,
        updatedAt: now,
      },
    })
    .returning();

  const body: LookupResponse = {
    found: true,
    ean,
    source: external.source,
    product: toProductDTO(saved),
    checksumValid,
    googleConfigured,
    links,
  };
  return NextResponse.json(body);
}
