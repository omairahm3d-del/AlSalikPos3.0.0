import { z } from "zod/v4";
import { saleRepo, type SaleInsertResult } from "../repositories/saleRepo";
import { badRequest } from "../lib/errors";

/**
 * Loose schema for the sale payload. The client owns this shape and the
 * server stores it verbatim in `payload` jsonb; we only validate the fields
 * we mirror into top-level columns. This keeps client schema evolution from
 * forcing a server-side migration on every change.
 */

// AED amounts: must be finite, non-NaN, at most 4 decimal places (matches the
// numeric(14,4) storage column). Reject anything that would either lose
// precision on cast or pollute reporting with floating-point artifacts.
const MAX_AMOUNT = 1e10; // 10 billion is a safe upper bound for a single sale
const moneyAmount = z
  .number()
  .refine(Number.isFinite, "must be a finite number")
  .refine((n) => Math.abs(n) < MAX_AMOUNT, "amount out of range")
  .refine((n) => {
    // Allow up to 4 decimal places. Multiply-and-round avoids tripping on the
    // common "0.1 + 0.2" floating-point artifacts at the 4-decimal scale.
    const scaled = Math.round(n * 10000);
    return Math.abs(scaled / 10000 - n) < 1e-9;
  }, "amount has too many decimal places (max 4)");

// createdAt is a JS millisecond epoch. Reject obvious garbage (seconds
// instead of ms, year 1970, far-future timestamps) so reporting stays clean.
const MIN_EPOCH_MS = Date.parse("2020-01-01T00:00:00Z");
const createdAtMs = z
  .number()
  .int()
  .refine((n) => n >= MIN_EPOCH_MS, "createdAt is too far in the past (expected ms epoch)")
  .refine((n) => n <= Date.now() + 24 * 60 * 60 * 1000, "createdAt is in the future");

const splitPaymentSchema = z.object({
  method: z.string(),
  amount: moneyAmount,
});

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
    return {
      results,
      inserted,
      duplicates: results.length - inserted,
    };
  },
};
