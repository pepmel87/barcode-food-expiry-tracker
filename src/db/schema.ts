import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Catalogo prodotti: un record per ogni EAN scansionato.
 * Viene popolato automaticamente da Open Food Facts / UPCitemdb / Google
 * oppure manualmente dall'utente.
 */
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  ean: varchar("ean", { length: 32 }).notNull().unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  description: text("description"),
  imageUrl: text("image_url"),
  category: text("category"),
  quantity: text("quantity"),
  // "fresh" = prodotto fresco / da frigo, "long_life" = lunga conservazione
  storageType: varchar("storage_type", { length: 16 }).notNull().default("fresh"),
  // openfoodfacts | upcitemdb | google | manual
  source: varchar("source", { length: 32 }).notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Lotti: ogni scansione con data di scadenza crea un lotto.
 */
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  expiryDate: date("expiry_date").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Spunta "molti pezzi con stessa scadenza" -> preavviso a 7 giorni (solo freschi)
  manyPieces: boolean("many_pieces").notNull().default(false),
  // snapshot del tipo di conservazione al momento dell'inserimento
  storageType: varchar("storage_type", { length: 16 }).notNull().default("fresh"),
  // giorni di preavviso calcolati (3 / 7 / 15)
  alertDays: integer("alert_days").notNull().default(3),
  notes: text("notes"),
  // active | on_sale | sold | discarded
  status: varchar("status", { length: 16 }).notNull().default("active"),
  alertSentAt: timestamp("alert_sent_at", { withTimezone: true }),
  expiredSentAt: timestamp("expired_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Centro notifiche in-app (storico di tutti gli avvisi generati).
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => batches.id, { onDelete: "cascade" }),
  // alert | expired | info
  type: varchar("type", { length: 16 }).notNull().default("alert"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sottoscrizioni Web Push dei dispositivi.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Impostazioni chiave/valore (es. chiavi VAPID generate automaticamente).
 */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
