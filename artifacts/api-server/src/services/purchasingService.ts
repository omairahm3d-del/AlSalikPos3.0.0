import { z } from "zod/v4";
import { supplierRepo } from "../repositories/supplierRepo";
import { purchaseRepo } from "../repositories/purchaseRepo";
import { stockRepo } from "../repositories/stockRepo";
import { branchRepo } from "../repositories/branchRepo";
import { badRequest, conflict, notFound } from "../lib/errors";
import type { Supplier, Purchase, PurchaseItem } from "@workspace/saas-db";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const moneyAmount = z
  .number()
  .refine(Number.isFinite, "must be a finite number")
  .refine((n) => n >= 0, "must be non-negative")
  .refine((n) => n < 1e10, "amount out of range")
  .refine((n) => {
    const scaled = Math.round(n * 10000);
    return Math.abs(scaled / 10000 - n) < 1e-9;
  }, "amount has too many decimal places (max 4)");

export const supplierInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).nullish(),
  email: z.string().max(200).nullish(),
  address: z.string().max(500).nullish(),
  paymentTerms: z.string().max(200).nullish(),
  notes: z.string().max(1000).nullish(),
  // Omit / null = company-wide; otherwise scoped to that branch.
  branchId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
});
export type SupplierInput = z.infer<typeof supplierInput>;

export const purchaseLineInput = z.object({
  productClientId: z.string().min(1).max(128),
  productName: z.string().min(1).max(200),
  sku: z.string().max(64).nullish(),
  quantity: z.number().int().positive().max(1_000_000),
  unitCost: moneyAmount,
  vatAmount: moneyAmount.optional(),
});
export type PurchaseLineInput = z.infer<typeof purchaseLineInput>;

export const purchaseInput = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid().nullish(),
  supplierName: z.string().min(1).max(200),
  referenceNumber: z.string().max(100).nullish(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().max(1000).nullish(),
  items: z.array(purchaseLineInput).min(1).max(500),
  /**
   * Optional client-supplied stable key. If present and a purchase with
   * the same `(companyId, idempotencyKey)` already exists, the server
   * returns it unchanged instead of creating a duplicate GRN + duplicate
   * stock movements. The Back Office generates a fresh UUID per
   * "Receive Stock" form open.
   */
  idempotencyKey: z.string().min(8).max(64).nullish(),
});
export type PurchaseInput = z.infer<typeof purchaseInput>;

export const adjustmentInput = z.object({
  branchId: z.string().uuid(),
  productClientId: z.string().min(1).max(128),
  productName: z.string().min(1).max(200),
  sku: z.string().max(64).nullish(),
  delta: z
    .number()
    .refine(Number.isFinite, "must be a finite number")
    .refine((n) => n !== 0, "delta cannot be zero")
    .refine((n) => Math.abs(n) < 1e7, "delta out of range"),
  reason: z.string().max(500).nullish(),
});
export type AdjustmentInput = z.infer<typeof adjustmentInput>;

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

async function assertBranchInCompany(companyId: string, branchId: string) {
  const branch = await branchRepo.findById(branchId);
  if (!branch || branch.companyId !== companyId) {
    throw notFound("branch_not_found", "Branch not found for this company");
  }
}

export const purchasingService = {
  /* ----- Suppliers ----- */

  async listSuppliers(companyId: string, branchId: string): Promise<Supplier[]> {
    await assertBranchInCompany(companyId, branchId);
    return supplierRepo.listForBranch(companyId, branchId);
  },

  async createSupplier(
    companyId: string,
    input: SupplierInput,
  ): Promise<Supplier> {
    if (input.branchId) await assertBranchInCompany(companyId, input.branchId);
    const trimmed = input.name.trim();
    if (!trimmed) throw badRequest("invalid_name", "Supplier name is required");
    try {
      return await supplierRepo.create({
        companyId,
        branchId: input.branchId ?? null,
        name: trimmed,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        paymentTerms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      });
    } catch (e) {
      if (
        e instanceof Error &&
        /duplicate key|unique/i.test(e.message) &&
        /name/i.test(e.message)
      ) {
        throw conflict(
          "supplier_name_taken",
          `A supplier named "${trimmed}" already exists in this scope`,
        );
      }
      throw e;
    }
  },

  async updateSupplier(
    companyId: string,
    supplierId: string,
    patch: Partial<SupplierInput>,
  ): Promise<Supplier> {
    const existing = await supplierRepo.findById(supplierId);
    if (!existing || existing.companyId !== companyId) {
      throw notFound("supplier_not_found", "Supplier not found");
    }
    if (patch.branchId !== undefined && patch.branchId !== null) {
      await assertBranchInCompany(companyId, patch.branchId);
    }
    const updated = await supplierRepo.update(supplierId, companyId, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
      ...(patch.email !== undefined ? { email: patch.email ?? null } : {}),
      ...(patch.address !== undefined ? { address: patch.address ?? null } : {}),
      ...(patch.paymentTerms !== undefined
        ? { paymentTerms: patch.paymentTerms ?? null }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.branchId !== undefined
        ? { branchId: patch.branchId ?? null }
        : {}),
    });
    if (!updated) throw notFound("supplier_not_found", "Supplier not found");
    return updated;
  },

  /* ----- Purchases ----- */

  async createPurchase(
    companyId: string,
    input: PurchaseInput,
    createdByManagerId: string | null,
  ): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
    await assertBranchInCompany(companyId, input.branchId);
    if (input.supplierId) {
      const sup = await supplierRepo.findById(input.supplierId);
      if (!sup || sup.companyId !== companyId) {
        throw notFound("supplier_not_found", "Supplier not found");
      }
      if (sup.branchId && sup.branchId !== input.branchId) {
        throw badRequest(
          "supplier_branch_mismatch",
          "Supplier is private to a different branch",
        );
      }
    }

    // Idempotency: if the client supplied a key and we already saved a
    // purchase under it, return the original row + items unchanged. This
    // protects against retries (network flake, double-click) which would
    // otherwise create a duplicate GRN AND duplicate stock movements
    // (since the stock unique index is keyed on the new purchase id).
    if (input.idempotencyKey) {
      const existing = await purchaseRepo.findByIdempotencyKey(
        companyId,
        input.idempotencyKey,
      );
      if (existing) {
        const items = await purchaseRepo.itemsForPurchase(existing.id);
        return { purchase: existing, items };
      }
    }

    // Aggregate duplicate product lines so (a) the stock unique index on
    // (companyId, kind, refId, productClientId) doesn't reject the txn
    // and (b) we still record the user's full intent. Money is summed at
    // 4-decimal precision (matches the numeric column) before stringifying.
    const aggregated = new Map<
      string,
      {
        productName: string;
        sku: string | null;
        quantity: number;
        unitCost: number;
        vatAmount: number;
      }
    >();
    for (const it of input.items) {
      const cur = aggregated.get(it.productClientId);
      if (cur) {
        // Weight unitCost by quantity so the aggregated row reflects the
        // average cost the user actually paid across the duplicated lines.
        const newQty = cur.quantity + it.quantity;
        cur.unitCost =
          newQty > 0
            ? Math.round(
                ((cur.unitCost * cur.quantity + it.unitCost * it.quantity) /
                  newQty) *
                  10000,
              ) / 10000
            : it.unitCost;
        cur.quantity = newQty;
        cur.vatAmount += it.vatAmount ?? 0;
      } else {
        aggregated.set(it.productClientId, {
          productName: it.productName.trim(),
          sku: it.sku ?? null,
          quantity: it.quantity,
          unitCost: it.unitCost,
          vatAmount: it.vatAmount ?? 0,
        });
      }
    }

    let subtotal = 0;
    let vatAmount = 0;
    const itemRows = Array.from(aggregated.entries()).map(
      ([productClientId, it]) => {
        const lineSubtotal = it.unitCost * it.quantity;
        subtotal += lineSubtotal;
        vatAmount += it.vatAmount;
        return {
          productClientId,
          productName: it.productName,
          sku: it.sku,
          quantity: it.quantity,
          unitCost: String(it.unitCost),
          vatAmount: String(it.vatAmount),
          lineTotal: String(lineSubtotal + it.vatAmount),
        };
      },
    );

    const receivedAt = input.receivedAt
      ? new Date(input.receivedAt)
      : new Date();

    try {
      return await purchaseRepo.createWithItems(
        {
          companyId,
          branchId: input.branchId,
          supplierId: input.supplierId ?? null,
          supplierName: input.supplierName.trim(),
          referenceNumber: input.referenceNumber ?? null,
          receivedAt,
          subtotal: String(subtotal),
          vatAmount: String(vatAmount),
          total: String(subtotal + vatAmount),
          notes: input.notes ?? null,
          createdByManagerId,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        itemRows,
      );
    } catch (e) {
      // Lost a race against a concurrent request with the same key —
      // return the winning row instead of bubbling the unique violation.
      if (
        input.idempotencyKey &&
        e instanceof Error &&
        /idempotency_key|saas_purchases_company_idempotency_idx/.test(e.message)
      ) {
        const existing = await purchaseRepo.findByIdempotencyKey(
          companyId,
          input.idempotencyKey,
        );
        if (existing) {
          const items = await purchaseRepo.itemsForPurchase(existing.id);
          return { purchase: existing, items };
        }
      }
      throw e;
    }
  },

  async listPurchases(
    companyId: string,
    branchId: string,
    opts: { from?: string; to?: string; limit?: number },
  ): Promise<Purchase[]> {
    await assertBranchInCompany(companyId, branchId);
    return purchaseRepo.listByBranch(companyId, branchId, {
      from: opts.from ? new Date(opts.from) : undefined,
      to: opts.to ? new Date(opts.to) : undefined,
      limit: opts.limit,
    });
  },

  async getPurchase(
    companyId: string,
    purchaseId: string,
  ): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
    const p = await purchaseRepo.findById(purchaseId);
    if (!p || p.companyId !== companyId) {
      throw notFound("purchase_not_found", "Purchase not found");
    }
    const items = await purchaseRepo.itemsForPurchase(purchaseId);
    return { purchase: p, items };
  },

  async getSupplierStatement(
    companyId: string,
    supplierId: string,
    opts: { branchId?: string; from?: string; to?: string; limit?: number },
  ): Promise<{
    supplier: Supplier;
    purchases: Purchase[];
    totals: {
      count: number;
      subtotal: string;
      vatAmount: string;
      total: string;
      missingReferenceCount: number;
    };
  }> {
    const supplier = await supplierRepo.findById(supplierId);
    if (!supplier || supplier.companyId !== companyId) {
      throw notFound("supplier_not_found", "Supplier not found");
    }
    if (opts.branchId) await assertBranchInCompany(companyId, opts.branchId);
    // A supplier may be branch-private: don't let a caller pull purchases
    // for it from a different branch even if the manager has company access.
    if (
      supplier.branchId &&
      opts.branchId &&
      supplier.branchId !== opts.branchId
    ) {
      throw badRequest(
        "supplier_branch_mismatch",
        "Supplier is private to a different branch",
      );
    }
    const purchases = await purchaseRepo.listForSupplier(
      companyId,
      supplierId,
      {
        branchId: opts.branchId,
        from: opts.from ? new Date(opts.from) : undefined,
        to: opts.to ? new Date(opts.to) : undefined,
        limit: opts.limit,
      },
    );
    let subtotal = 0;
    let vatAmount = 0;
    let total = 0;
    let missingReferenceCount = 0;
    for (const p of purchases) {
      subtotal += Number(p.subtotal);
      vatAmount += Number(p.vatAmount);
      total += Number(p.total);
      const ref = p.referenceNumber?.trim();
      if (!ref) missingReferenceCount += 1;
    }
    const round4 = (n: number) => (Math.round(n * 10000) / 10000).toString();
    return {
      supplier,
      purchases,
      totals: {
        count: purchases.length,
        subtotal: round4(subtotal),
        vatAmount: round4(vatAmount),
        total: round4(total),
        missingReferenceCount,
      },
    };
  },

  /* ----- Stock ----- */

  async listOnHand(companyId: string, branchId: string) {
    await assertBranchInCompany(companyId, branchId);
    return stockRepo.onHandForBranch(companyId, branchId);
  },

  async listMovements(
    companyId: string,
    branchId: string,
    opts: { productClientId?: string; limit?: number },
  ) {
    await assertBranchInCompany(companyId, branchId);
    return stockRepo.movementsForBranch(companyId, branchId, opts);
  },

  async createAdjustment(
    companyId: string,
    input: AdjustmentInput,
  ): Promise<{ id: string }> {
    await assertBranchInCompany(companyId, input.branchId);
    // Each adjustment gets a fresh uuid as its refId so the unique key
    // (companyId, kind, refId, productClientId) never blocks subsequent
    // adjustments to the same product.
    const refId = crypto.randomUUID();
    const [row] = await stockRepo.insertMany([
      {
        companyId,
        branchId: input.branchId,
        productClientId: input.productClientId,
        productName: input.productName.trim(),
        sku: input.sku ?? null,
        delta: String(input.delta),
        kind: "adjustment",
        refId,
        reason: input.reason ?? null,
      },
    ]);
    if (!row) throw new Error("Failed to record stock adjustment");
    return { id: row.id };
  },
};
