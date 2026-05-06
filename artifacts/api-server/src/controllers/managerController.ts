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
import { forbidden, notFound } from "../lib/errors";

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
};

// Belt-and-suspenders: assert managerService remains the only path to read
// other companies' data. (Defensive — real isolation is enforced by the
// `companyId` filter on every query above.)
export function assertSameCompany(req: Request, companyId: string) {
  if (req.manager?.companyId !== companyId) {
    throw forbidden("forbidden", "Cross-company access denied");
  }
}
