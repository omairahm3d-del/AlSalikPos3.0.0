import { authedFetch } from "@/lib/saasApi";

/**
 * Thin client for the device-auth `/api/pos/*` purchasing & stock endpoints.
 * The device token already carries the company + branch, so callers don't
 * pass them — the server pins everything to the device's bound branch.
 */

export interface PosSupplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PosPurchaseRow {
  id: string;
  branchId: string | null;
  supplierId: string | null;
  supplierName: string;
  referenceNumber: string | null;
  receivedAt: string;
  notes: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  itemCount: number;
}

export interface PosPurchaseItem {
  id: string;
  purchaseId: string;
  productClientId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitCost: string;
  vatAmount: string;
  lineTotal: string;
}

export interface PosStockRow {
  productClientId: string;
  productName: string;
  sku: string | null;
  onHand: string;
}

export interface PosStockMovement {
  id: string;
  branchId: string | null;
  productClientId: string;
  productName: string;
  kind: "purchase" | "sale" | "adjustment";
  delta: string;
  refId: string;
  reason: string | null;
  createdAt: string;
}

async function jsonOk<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const posApi = {
  listSuppliers: async (token: string) =>
    jsonOk<{ suppliers: PosSupplier[] }>(
      await authedFetch("/api/pos/suppliers", token),
    ),

  createSupplier: async (
    token: string,
    body: { name: string; phone?: string | null; email?: string | null; address?: string | null; paymentTerms?: string | null; notes?: string | null },
  ) =>
    jsonOk<{ supplier: PosSupplier }>(
      await authedFetch("/api/pos/suppliers", token, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),

  updateSupplier: async (
    token: string,
    id: string,
    patch: Partial<{
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      paymentTerms: string | null;
      notes: string | null;
      isActive: boolean;
    }>,
  ) =>
    jsonOk<{ supplier: PosSupplier }>(
      await authedFetch(`/api/pos/suppliers/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    ),

  listPurchases: async (
    token: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    if (opts.limit) qs.set("limit", String(opts.limit));
    const path = `/api/pos/purchases${qs.toString() ? `?${qs}` : ""}`;
    return jsonOk<{ purchases: PosPurchaseRow[] }>(await authedFetch(path, token));
  },

  getPurchase: async (token: string, id: string) =>
    jsonOk<{ purchase: PosPurchaseRow; items: PosPurchaseItem[] }>(
      await authedFetch(`/api/pos/purchases/${id}`, token),
    ),

  createPurchase: async (
    token: string,
    body: {
      supplierId?: string | null;
      supplierName: string;
      referenceNumber?: string | null;
      receivedAt?: string;
      notes?: string | null;
      idempotencyKey?: string;
      items: Array<{
        productClientId: string;
        productName: string;
        sku?: string | null;
        quantity: number;
        unitCost: number;
        vatAmount?: number;
      }>;
    },
  ) =>
    jsonOk<{ purchase: PosPurchaseRow; items: PosPurchaseItem[] }>(
      await authedFetch("/api/pos/purchases", token, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),

  listStock: async (token: string) =>
    jsonOk<{ stock: PosStockRow[] }>(
      await authedFetch("/api/pos/stock", token),
    ),

  listMovements: async (
    token: string,
    opts: { productClientId?: string; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.productClientId) qs.set("productClientId", opts.productClientId);
    if (opts.limit) qs.set("limit", String(opts.limit));
    const path = `/api/pos/stock/movements${qs.toString() ? `?${qs}` : ""}`;
    return jsonOk<{ movements: PosStockMovement[] }>(await authedFetch(path, token));
  },

  createAdjustment: async (
    token: string,
    body: {
      productClientId: string;
      productName: string;
      sku?: string | null;
      delta: number;
      reason?: string | null;
    },
  ) =>
    jsonOk<{ id: string }>(
      await authedFetch("/api/pos/stock/adjustments", token, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),
};
