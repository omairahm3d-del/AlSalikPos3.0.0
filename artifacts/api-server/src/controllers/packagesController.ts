import { z } from "zod/v4";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  saasDb,
  packagesTable,
  customerPackagesTable,
} from "@workspace/saas-db";
import { badRequest, notFound } from "../lib/errors";

const packageBody = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  totalSessions: z.coerce.number().int().min(1).max(9999),
  price: z.coerce.number().min(0),
  applicableServiceIds: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
});

const listQuery = z.object({
  branchId: z.string().uuid().optional(),
  includeInactive: z.coerce.boolean().optional(),
});

function serializePackage(row: typeof packagesTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    name: row.name,
    description: row.description,
    totalSessions: row.totalSessions,
    price: Number(row.price),
    applicableServiceIds: row.applicableServiceIds
      ? (JSON.parse(row.applicableServiceIds) as string[])
      : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeCustomerPackage(
  row: typeof customerPackagesTable.$inferSelect,
) {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    packageId: row.packageId,
    customerClientId: row.customerClientId,
    customerName: row.customerName,
    packageName: row.packageName,
    totalSessions: row.totalSessions,
    usedSessions: row.usedSessions,
    remainingSessions: Math.max(0, row.totalSessions - row.usedSessions),
    purchaseSaleClientId: row.purchaseSaleClientId,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: row.isActive,
    purchasedAt: row.purchasedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function listPackages(req: Request, res: Response) {
  const query = listQuery.parse(req.query);
  const companyId = req.manager!.companyId;

  const rows = await saasDb
    .select()
    .from(packagesTable)
    .where(
      and(
        eq(packagesTable.companyId, companyId),
        query.branchId
          ? or(
              eq(packagesTable.branchId, query.branchId),
              isNull(packagesTable.branchId),
            )
          : undefined,
        query.includeInactive ? undefined : eq(packagesTable.isActive, true),
      ),
    )
    .orderBy(packagesTable.name);

  res.json({ packages: rows.map(serializePackage) });
}

async function createPackage(req: Request, res: Response) {
  const body = packageBody.parse(req.body);
  const companyId = req.manager!.companyId;

  const [row] = await saasDb
    .insert(packagesTable)
    .values({
      companyId,
      branchId: body.branchId ?? null,
      name: body.name,
      description: body.description,
      totalSessions: body.totalSessions,
      price: body.price,
      applicableServiceIds: body.applicableServiceIds
        ? JSON.stringify(body.applicableServiceIds)
        : null,
      isActive: body.isActive ?? true,
    })
    .returning();

  res.status(201).json({ package: serializePackage(row!) });
}

async function updatePackage(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const body = packageBody.partial().parse(req.body);
  const companyId = req.manager!.companyId;

  const existing = await saasDb
    .select()
    .from(packagesTable)
    .where(
      and(eq(packagesTable.id, id), eq(packagesTable.companyId, companyId)),
    )
    .then((r) => r[0]);
  if (!existing) throw notFound("package_not_found", "Package not found");

  const updateData: Partial<typeof packagesTable.$inferInsert> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.totalSessions !== undefined)
    updateData.totalSessions = body.totalSessions;
  if (body.price !== undefined) updateData.price = body.price;
  if (body.applicableServiceIds !== undefined)
    updateData.applicableServiceIds = body.applicableServiceIds
      ? JSON.stringify(body.applicableServiceIds)
      : null;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const [updated] = await saasDb
    .update(packagesTable)
    .set(updateData)
    .where(eq(packagesTable.id, id))
    .returning();

  res.json({ package: serializePackage(updated!) });
}

async function deletePackage(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const companyId = req.manager!.companyId;

  const existing = await saasDb
    .select()
    .from(packagesTable)
    .where(
      and(eq(packagesTable.id, id), eq(packagesTable.companyId, companyId)),
    )
    .then((r) => r[0]);
  if (!existing) throw notFound("package_not_found", "Package not found");

  await saasDb
    .update(packagesTable)
    .set({ isActive: false })
    .where(eq(packagesTable.id, id));

  res.json({ success: true });
}

async function listCustomerPackages(req: Request, res: Response) {
  const query = z
    .object({
      branchId: z.string().uuid().optional(),
      customerClientId: z.string().optional(),
      includeInactive: z.coerce.boolean().optional(),
    })
    .parse(req.query);
  const companyId = req.manager!.companyId;

  const rows = await saasDb
    .select()
    .from(customerPackagesTable)
    .where(
      and(
        eq(customerPackagesTable.companyId, companyId),
        query.branchId
          ? or(
              eq(customerPackagesTable.branchId, query.branchId),
              isNull(customerPackagesTable.branchId),
            )
          : undefined,
        query.customerClientId
          ? eq(
              customerPackagesTable.customerClientId,
              query.customerClientId,
            )
          : undefined,
        query.includeInactive
          ? undefined
          : eq(customerPackagesTable.isActive, true),
      ),
    )
    .orderBy(desc(customerPackagesTable.purchasedAt));

  res.json({ customerPackages: rows.map(serializeCustomerPackage) });
}

export const packagesController = {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
  listCustomerPackages,
};
