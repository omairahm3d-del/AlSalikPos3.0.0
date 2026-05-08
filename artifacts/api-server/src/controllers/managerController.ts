import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { and, desc, eq, gte, lte, lt, sql, or, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  saasDb,
  salesTable,
  productsTable,
  categoriesTable,
  customersTable,
} from "@workspace/saas-db";
import { managerService } from "../services/managerService";
import { branchRepo } from "../repositories/branchRepo";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";

const loginBody = z.object({
  companySlug: z.string().min(1).max(63),
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(200),
});

const listQuery = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

const importProductRow = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).default(""),
  price: z.coerce.number().min(0),
  sku: z.string().max(100).default(""),
  barcode: z.string().max(100).default(""),
  description: z.string().max(500).default(""),
  stockQuantity: z.coerce.number().int().default(0),
  vatInclusive: z.coerce.boolean().default(false),
});

const importBody = z.object({
  branchId: z.string().uuid(),
  products: z.array(importProductRow).min(1).max(1000),
});

/**
 * Cursor format: "<iso8601 createdAtClient>__<sale uuid>".
 * Encodes the keyset position used by the (createdAtClient DESC, id DESC)
 * order. Returned by `listSales` whenever the page is full so the client can
 * page through ranges with more rows than the per-request limit (max 500).
 */
function decodeCursor(
  raw: string | undefined,
): { createdAt: Date; id: string } | undefined {
  if (!raw) return undefined;
  const idx = raw.indexOf("__");
  if (idx <= 0) return undefined;
  const iso = raw.slice(0, idx);
  const id = raw.slice(idx + 2);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || !id) return undefined;
  return { createdAt: d, id };
}

function encodeCursor(row: { createdAtClient: Date; id: string }): string {
  return `${row.createdAtClient.toISOString()}__${row.id}`;
}

async function assertBranchInCompany(
  companyId: string,
  branchId: string,
): Promise<void> {
  const branch = await branchRepo.findById(branchId);
  if (!branch || branch.companyId !== companyId) {
    throw notFound("branch_not_found", "Branch not found for this company");
  }
}

function branchScope(
  table:
    | typeof salesTable
    | typeof productsTable
    | typeof categoriesTable
    | typeof customersTable,
  branchId: string | undefined,
) {
  if (!branchId) return undefined;
  // Branch-scoped reads include legacy NULL rows so pre-backfill data is
  // still visible to the back office.
  return or(eq(table.branchId, branchId), isNull(table.branchId));
}

export const managerController = {
  async login(req: Request, res: Response) {
    const input = loginBody.parse(req.body);
    const result = await managerService.login(input);
    req.log.info(
      { managerId: result.manager.id, companyId: result.company.id },
      "Manager logged in",
    );
    res.json(result);
  },

  async me(req: Request, res: Response) {
    const m = req.manager!;
    const branches = await branchRepo.listActiveByCompany(m.companyId);
    res.json({
      manager: { id: m.managerId, email: m.email, companyId: m.companyId },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
      })),
    });
  },

  async listBranches(req: Request, res: Response) {
    const m = req.manager!;
    const branches = await branchRepo.listActiveByCompany(m.companyId);
    res.json({ branches });
  },

  async listSales(req: Request, res: Response) {
    const m = req.manager!;
    const q = listQuery.parse(req.query);
    if (q.branchId) await assertBranchInCompany(m.companyId, q.branchId);
    const limit = q.limit ?? 100;
    const conds = [eq(salesTable.companyId, m.companyId)];
    const scope = branchScope(salesTable, q.branchId);
    if (scope) conds.push(scope);
    if (q.from) conds.push(gte(salesTable.createdAtClient, new Date(q.from)));
    if (q.to) conds.push(lte(salesTable.createdAtClient, new Date(q.to)));
    const cur = decodeCursor(q.cursor);
    if (cur) {
      // Keyset paging: strictly past (createdAt, id) under DESC ordering.
      conds.push(
        or(
          lt(salesTable.createdAtClient, cur.createdAt),
          and(
            eq(salesTable.createdAtClient, cur.createdAt),
            lt(salesTable.id, cur.id),
          ),
        )!,
      );
    }
    const rows = await saasDb
      .select()
      .from(salesTable)
      .where(and(...conds))
      .orderBy(desc(salesTable.createdAtClient), desc(salesTable.id))
      .limit(limit);
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last ? encodeCursor(last) : null;
    res.json({ sales: rows, nextCursor });
  },

  async salesSummary(req: Request, res: Response) {
    const m = req.manager!;
    const q = listQuery.parse(req.query);
    if (q.branchId) await assertBranchInCompany(m.companyId, q.branchId);
    const conds = [eq(salesTable.companyId, m.companyId)];
    const scope = branchScope(salesTable, q.branchId);
    if (scope) conds.push(scope);
    if (q.from) conds.push(gte(salesTable.createdAtClient, new Date(q.from)));
    if (q.to) conds.push(lte(salesTable.createdAtClient, new Date(q.to)));
    const [row] = await saasDb
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${salesTable.total}), 0)::text`,
        vat: sql<string>`coalesce(sum(${salesTable.vatAmount}), 0)::text`,
      })
      .from(salesTable)
      .where(and(...conds));
    res.json({
      count: row?.count ?? 0,
      total: row?.total ?? "0",
      vat: row?.vat ?? "0",
    });
  },

  async listProducts(req: Request, res: Response) {
    const m = req.manager!;
    const q = listQuery.parse(req.query);
    if (q.branchId) await assertBranchInCompany(m.companyId, q.branchId);
    const conds = [
      eq(productsTable.companyId, m.companyId),
      isNull(productsTable.deletedAt),
    ];
    const scope = branchScope(productsTable, q.branchId);
    if (scope) conds.push(scope);
    const rows = await saasDb
      .select({
        clientId: productsTable.clientId,
        payload: productsTable.payload,
        clientUpdatedAt: productsTable.clientUpdatedAt,
        branchId: productsTable.branchId,
      })
      .from(productsTable)
      .where(and(...conds))
      .orderBy(desc(productsTable.clientUpdatedAt))
      .limit(q.limit ?? 500);
    res.json({ products: rows });
  },

  async listCategories(req: Request, res: Response) {
    const m = req.manager!;
    const q = listQuery.parse(req.query);
    if (q.branchId) await assertBranchInCompany(m.companyId, q.branchId);
    const conds = [
      eq(categoriesTable.companyId, m.companyId),
      isNull(categoriesTable.deletedAt),
    ];
    const scope = branchScope(categoriesTable, q.branchId);
    if (scope) conds.push(scope);
    const rows = await saasDb
      .select({
        clientId: categoriesTable.clientId,
        payload: categoriesTable.payload,
        clientUpdatedAt: categoriesTable.clientUpdatedAt,
        branchId: categoriesTable.branchId,
      })
      .from(categoriesTable)
      .where(and(...conds))
      .orderBy(desc(categoriesTable.clientUpdatedAt))
      .limit(q.limit ?? 500);
    res.json({ categories: rows });
  },

  async listCustomers(req: Request, res: Response) {
    const m = req.manager!;
    const q = listQuery.parse(req.query);
    if (q.branchId) await assertBranchInCompany(m.companyId, q.branchId);
    const conds = [
      eq(customersTable.companyId, m.companyId),
      isNull(customersTable.deletedAt),
    ];
    const scope = branchScope(customersTable, q.branchId);
    if (scope) conds.push(scope);
    const rows = await saasDb
      .select({
        clientId: customersTable.clientId,
        payload: customersTable.payload,
        clientUpdatedAt: customersTable.clientUpdatedAt,
        branchId: customersTable.branchId,
      })
      .from(customersTable)
      .where(and(...conds))
      .orderBy(desc(customersTable.clientUpdatedAt))
      .limit(q.limit ?? 500);
    res.json({ customers: rows });
  },

  /**
   * Bulk import products (and auto-create categories) via manager auth.
   * For each product: matches by name+branch to update existing or create new.
   * Categories are looked up by name and created if absent.
   */
  async importCatalog(req: Request, res: Response) {
    const m = req.manager!;
    const body = importBody.parse(req.body);
    await assertBranchInCompany(m.companyId, body.branchId);

    const now = new Date();
    const nowMs = now.getTime();

    // 1. Resolve / create categories by name
    const categoryNames = [
      ...new Set(body.products.map((p) => p.category).filter(Boolean)),
    ];
    for (const catName of categoryNames) {
      const [existing] = await saasDb
        .select({ clientId: categoriesTable.clientId })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.companyId, m.companyId),
            isNull(categoriesTable.deletedAt),
            sql`${categoriesTable.payload}->>'name' = ${catName}`,
            or(
              eq(categoriesTable.branchId, body.branchId),
              isNull(categoriesTable.branchId),
            ),
          ),
        )
        .limit(1);

      if (!existing) {
        const clientId = randomUUID();
        await saasDb.insert(categoriesTable).values({
          companyId: m.companyId,
          branchId: body.branchId,
          clientId,
          payload: {
            id: clientId,
            name: catName,
            colorHex: "#6B7280",
            updatedAt: nowMs,
          },
          clientUpdatedAt: now,
          serverUpdatedAt: now,
        });
      }
    }

    // 2. Upsert products — match by name within company+branch
    let created = 0;
    let updated = 0;

    for (const p of body.products) {
      const [existing] = await saasDb
        .select({
          clientId: productsTable.clientId,
          payload: productsTable.payload,
        })
        .from(productsTable)
        .where(
          and(
            eq(productsTable.companyId, m.companyId),
            isNull(productsTable.deletedAt),
            sql`${productsTable.payload}->>'name' = ${p.name}`,
            or(
              eq(productsTable.branchId, body.branchId),
              isNull(productsTable.branchId),
            ),
          ),
        )
        .limit(1);

      if (existing) {
        const merged = {
          ...(existing.payload as Record<string, unknown>),
          name: p.name,
          category: p.category,
          price: p.price,
          sku: p.sku,
          barcode: p.barcode,
          description: p.description,
          stockQuantity: p.stockQuantity,
          vatInclusive: p.vatInclusive,
          updatedAt: nowMs,
        };
        await saasDb
          .update(productsTable)
          .set({ payload: merged, clientUpdatedAt: now, serverUpdatedAt: now })
          .where(
            and(
              eq(productsTable.clientId, existing.clientId),
              eq(productsTable.companyId, m.companyId),
            ),
          );
        updated++;
      } else {
        const clientId = randomUUID();
        await saasDb.insert(productsTable).values({
          companyId: m.companyId,
          branchId: body.branchId,
          clientId,
          payload: {
            id: clientId,
            name: p.name,
            category: p.category,
            price: p.price,
            sku: p.sku,
            barcode: p.barcode,
            description: p.description,
            stockQuantity: p.stockQuantity,
            stockTracked: p.stockQuantity > 0,
            vatInclusive: p.vatInclusive,
            colorHex: "#6B7280",
            lowStockThreshold: 5,
            updatedAt: nowMs,
          },
          clientUpdatedAt: now,
          serverUpdatedAt: now,
        });
        created++;
      }
    }

    req.log.info(
      { companyId: m.companyId, branchId: body.branchId, created, updated },
      "Manager catalog import",
    );
    res.json({ created, updated, total: body.products.length });
  },

  /**
   * Create a full-amount refund for an existing sale (manager-initiated).
   * The refund sale inherits the original's deviceId so it passes the FK
   * constraint without requiring a schema change.
   */
  async createRefund(req: Request, res: Response) {
    const m = req.manager!;
    const clientSaleId = String(req.params.clientSaleId);

    const [original] = await saasDb
      .select()
      .from(salesTable)
      .where(
        and(
          eq(salesTable.clientSaleId, clientSaleId),
          eq(salesTable.companyId, m.companyId),
        ),
      )
      .limit(1);

    if (!original) throw notFound("sale_not_found", "Sale not found");
    if (original.isRefund)
      throw badRequest("already_refund", "Cannot refund a refund transaction");

    const [existingRefund] = await saasDb
      .select({ id: salesTable.id })
      .from(salesTable)
      .where(
        and(
          eq(salesTable.originalClientSaleId, clientSaleId),
          eq(salesTable.companyId, m.companyId),
        ),
      )
      .limit(1);

    if (existingRefund)
      throw conflict("already_refunded", "This sale has already been refunded");

    const refundClientSaleId = randomUUID();
    const now = new Date();
    const origTotal = Math.abs(parseFloat(String(original.total)));
    const origVat = Math.abs(parseFloat(String(original.vatAmount)));
    const origPayload = (original.payload ?? {}) as Record<string, unknown>;
    const origSubtotal =
      typeof origPayload.subtotal === "number"
        ? origPayload.subtotal
        : parseFloat(String(origPayload.subtotal ?? 0));

    await saasDb.insert(salesTable).values({
      companyId: m.companyId,
      deviceId: original.deviceId,
      branchId: original.branchId,
      clientSaleId: refundClientSaleId,
      invoiceNumber: `REF-${original.invoiceNumber}`,
      createdAtClient: now,
      total: String(-origTotal),
      vatAmount: String(-origVat),
      paymentMethod: original.paymentMethod,
      isRefund: true,
      originalClientSaleId: clientSaleId,
      staffId: null,
      customerId: original.customerId,
      payload: {
        ...origPayload,
        id: refundClientSaleId,
        invoiceNumber: `REF-${original.invoiceNumber}`,
        isRefund: true,
        total: -origTotal,
        vatAmount: -origVat,
        subtotal: -origSubtotal,
      },
    });

    req.log.info(
      { companyId: m.companyId, originalClientSaleId: clientSaleId, refundClientSaleId },
      "Manager-initiated refund",
    );
    res.json({
      success: true,
      refundClientSaleId,
      invoiceNumber: `REF-${original.invoiceNumber}`,
    });
  },
};

// Belt-and-suspenders: assert managerService remains the only path to read
// other companies' data. (Defensive — real isolation is enforced by the
// `companyId` filter on every query above.)
export function assertSameCompany(req: Request, companyId: string) {
  if (req.manager?.companyId !== companyId) {
    throw forbidden("forbidden", "Cross-company access denied");
  }
}
