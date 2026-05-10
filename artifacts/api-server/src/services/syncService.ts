import { z } from "zod/v4";
import { saleRepo, type SaleInsertResult } from "../repositories/saleRepo";
import { stockRepo } from "../repositories/stockRepo";
import { branchRepo } from "../repositories/branchRepo";
import { badRequest } from "../lib/errors";
import type { InsertStockMovement } from "@workspace/saas-db";

/**
 * Loose schema for the sale payload. The client owns this shape and the
 * server stores it verbatim in `payload` jsonb; we only validate the fields
 * we mirror into top-level columns. This keeps client schema evolution from
 * forcing a server-side migration on every change.
 */

// AED amounts: must be finite and within range. The database column is
// numeric(14,4) so it rounds naturally on insert. We intentionally do NOT
// enforce exact 4-decimal precision here because JavaScript floating-point
// arithmetic (e.g. VAT-inclusive net/vat split) routinely produces values
// like 9.523809523809524 which are perfectly valid but would fail a strict
// 1e-9 deviation test. The DB cast is the authoritative rounding step.
const MAX_AMOUNT = 1e10; // 10 billion is a safe upper bound for a single sale
const moneyAmount = z
  .number()
  .refine(Number.isFinite, "must be a finite number")
  .refine((n) => Math.abs(n) < MAX_AMOUNT, "amount out of range");

// createdAt is a JS millisecond epoch. Reject obvious garbage (seconds
// instead of ms, year 1970, far-future timestamps) so reporting stays clean.
const MIN_EPOCH_MS = Date.parse("2020-01-01T00:00:00Z");
const createdAtMs = z
  .number()
  .int()
  .refine((n) => n >= MIN_EPOCH_MS, "createdAt is too far in the past (expected ms epoch)")
  .refine((n) => n <= Date.now() + 7 * 24 * 60 * 60 * 1000, "createdAt is too far in the future (check device clock)");

const splitPaymentSchema = z.object({
  method: z.string(),
  amount: moneyAmount,
});

const incomingSaleItemSchema = z
  .object({
    productId: z.string().min(1).max(128),
    productName: z.string().min(1).max(200),
    // Allow fractional quantities for weight-based / time-based sales (e.g. 0.75 kg, 1.5 hrs).
    quantity: z.number().positive().max(1_000_000),
  })
  .loose();

export const incomingSaleSchema = z.object({
  id: z.string().min(1).max(128),
  invoiceNumber: z.string().min(1).max(64),
  createdAt: createdAtMs,
  total: moneyAmount,
  vatAmount: moneyAmount,
  paymentMethod: z.string().min(1).max(64),
  isRefund: z.boolean().optional(),
  originalSaleId: z.string().max(128).optional(),
  staffId: z.string().max(128).optional(),
  customerId: z.string().max(128).optional(),
  splitPayments: z.array(splitPaymentSchema).optional(),
  items: z.array(incomingSaleItemSchema).optional(),
}).loose();

export type IncomingSale = z.infer<typeof incomingSaleSchema>;

export const pushSalesInputSchema = z.object({
  sales: z.array(incomingSaleSchema).min(1).max(200),
});

export interface PushSalesContext {
  companyId: string;
  deviceId: string;
  branchId?: string | null;
}

export interface PushSalesResult {
  results: SaleInsertResult[];
  inserted: number;
  duplicates: number;
}

export const syncService = {
  async pushSales(
    input: { sales: IncomingSale[] },
    ctx: PushSalesContext,
  ): Promise<PushSalesResult> {
    // Defend against duplicate clientSaleIds within the same batch — the
    // unique index would only insert one of them, but we'd be unable to
    // explain to the client which one won. Reject the whole batch instead.
    const seen = new Set<string>();
    for (const s of input.sales) {
      if (seen.has(s.id)) {
        throw badRequest("duplicate_in_batch", `Duplicate sale id "${s.id}" in batch`);
      }
      seen.add(s.id);
    }

    const rows = input.sales.map((s) => ({
      companyId: ctx.companyId,
      deviceId: ctx.deviceId,
      branchId: ctx.branchId ?? null,
      clientSaleId: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAtClient: new Date(s.createdAt),
      total: String(s.total),
      vatAmount: String(s.vatAmount),
      paymentMethod: s.paymentMethod,
      isRefund: s.isRefund ?? false,
      originalClientSaleId: s.originalSaleId ?? null,
      staffId: s.staffId ?? null,
      customerId: s.customerId ?? null,
      payload: s,
    }));

    const results = await saleRepo.bulkInsert(rows);
    const inserted = results.filter((r) => r.status === "inserted").length;

    // Mirror sale line items into stock_movements so stock-on-hand stays in
    // sync. We only mirror sales whose `saas_sales` row was actually
    // inserted by this push — replays of an existing sale ID must NOT
    // mutate stock even if the client's items array changes between
    // attempts (otherwise an authenticated device could replay an old
    // sale ID with new product IDs and arbitrarily move stock). Lines are
    // also aggregated by productClientId so the same product appearing
    // twice in one sale isn't dropped by `onConflictDoNothing`.
    // Mirror sale lines into stock_movements. Requires a branchId because the
    // stock_movements table has branchId NOT NULL (FK to branches). The
    // requireDevice middleware back-fills branchId from the DB for legacy
    // tokens; if it's still null here we fall back to the company's default
    // branch so stock tracking works even for pre-branch devices.
    const effectiveBranchId =
      ctx.branchId ??
      (await branchRepo.findDefault(ctx.companyId).then((b) => b?.id ?? null));
    if (effectiveBranchId) {
      const insertedIds = new Set(
        results.filter((r) => r.status === "inserted").map((r) => r.clientSaleId),
      );
      const movements: InsertStockMovement[] = [];
      for (const sale of input.sales) {
        if (!insertedIds.has(sale.id)) continue;
        const items = Array.isArray(sale.items) ? sale.items : [];
        if (items.length === 0) continue;
        const sign = sale.isRefund ? 1 : -1;
        const byProduct = new Map<
          string,
          { name: string; sku: string | null; qty: number }
        >();
        for (const it of items) {
          const qty = Number(it.quantity);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const key = String(it.productId);
          const rawSku = (it as Record<string, unknown>).sku;
          const sku = typeof rawSku === "string" ? rawSku : null;
          const cur = byProduct.get(key);
          if (cur) cur.qty += qty;
          else byProduct.set(key, { name: String(it.productName), sku, qty });
        }
        for (const [productClientId, agg] of byProduct) {
          movements.push({
            companyId: ctx.companyId,
            branchId: effectiveBranchId,
            productClientId,
            productName: agg.name,
            sku: agg.sku,
            delta: String(sign * agg.qty),
            kind: "sale",
            refId: sale.id,
            reason: null,
          });
        }
      }
      if (movements.length > 0) {
        await stockRepo.insertMany(movements);
      }
    }

    return {
      results,
      inserted,
      duplicates: results.length - inserted,
    };
  },
};
