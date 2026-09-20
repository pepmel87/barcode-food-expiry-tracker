import type { BatchStatus, StorageType, UrgencyLevel } from "./expiry";

export interface ProductDTO {
  id: number;
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  quantity: string | null;
  storageType: StorageType;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDTO {
  id: number;
  productId: number;
  expiryDate: string;
  quantity: number;
  manyPieces: boolean;
  storageType: StorageType;
  alertDays: number;
  notes: string | null;
  status: BatchStatus;
  alertSentAt: string | null;
  expiredSentAt: string | null;
  createdAt: string;
  product: ProductDTO;
  daysLeft: number;
  urgency: UrgencyLevel;
  alertDate: string;
}

export interface NotificationDTO {
  id: number;
  batchId: number | null;
  type: "alert" | "expired" | "info";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  batch?: {
    id: number;
    expiryDate: string;
    status: BatchStatus;
    productName: string;
    imageUrl: string | null;
  } | null;
}

export interface LookupResponse {
  found: boolean;
  ean: string;
  source: string | null;
  product: ProductDTO | null;
  checksumValid: boolean;
  googleConfigured: boolean;
  links: { web: string; images: string; openFoodFacts: string };
}
