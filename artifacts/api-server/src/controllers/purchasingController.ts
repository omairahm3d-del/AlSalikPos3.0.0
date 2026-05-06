import type { Request, Response } from "express";
import { z } from "zod/v4";
import {
  purchasingService,
  supplierInput,
  purchaseInput,
  adjustmentInput,
} from "../services/purchasingService";

const branchQuery = z.object({
  branchId: z.string().uuid(),
});

const purchaseQuery = z.object({
  branchId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const movementsQuery = z.object({
  branchId: z.string().uuid(),
  productClientId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// Manager tokens are company-wide today; per-branch enforcement is handled
// inside the service via assertBranchInCompany. Keeping this stub avoids
// scattering future ACL changes across every handler.
function requireBranchAccess(_req: Request, _branchId: string) {}

export const purchasingController = {
  /* ---- Suppliers ---- */
  async listSuppliers(req: Request, res: Response) {
    const m = req.manager!;
    const q = branchQuery.parse(req.query);
    requireBranchAccess(req, q.branchId);
    const suppliers = await purchasingService.listSuppliers(
      m.companyId,
      q.branchId,
    );
    res.json({ suppliers });
  },

  async createSupplier(req: Request, res: Response) {
    const m = req.manager!;
    const body = supplierInput.parse(req.body);
    if (body.branchId) requireBranchAccess(req, body.branchId);
    const supplier = await purchasingService.createSupplier(m.companyId, body);
    res.status(201).json({ supplier });
  },

  async updateSupplier(req: Request, res: Response) {
    const m = req.manager!;
    const id = z.string().uuid().parse(req.params.id);
    const body = supplierInput.partial().parse(req.body);
    const supplier = await purchasingService.updateSupplier(
      m.companyId,
      id,
      body,
    );
    res.json({ supplier });
  },

  async getSuppliersActivity(req: Request, res: Response) {
    const m = req.manager!;
    const q = z
      .object({
        branchId: z.string().uuid(),
        windowDays: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(req.query);
    requireBranchAccess(req, q.branchId);
    const activity = await purchasingService.getSuppliersActivity(
      m.companyId,
      q.branchId,
      q.windowDays ?? 30,
    );
    res.json({ activity });
  },

  async getSupplierStatement(req: Request, res: Response) {
    const m = req.manager!;
    const id = z.string().uuid().parse(req.params.id);
    const q = z
      .object({
        branchId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(5000).optional(),
      })
      .parse(req.query);
    if (q.branchId) requireBranchAccess(req, q.branchId);
    const result = await purchasingService.getSupplierStatement(
      m.companyId,
      id,
      q,
    );
    res.json(result);
  },

  /* ---- Purchases ---- */
  async listPurchases(req: Request, res: Response) {
    const m = req.manager!;
    const q = purchaseQuery.parse(req.query);
    requireBranchAccess(req, q.branchId);
    const purchases = await purchasingService.listPurchases(
      m.companyId,
      q.branchId,
      { from: q.from, to: q.to, limit: q.limit },
    );
    res.json({ purchases });
  },

  async createPurchase(req: Request, res: Response) {
    const m = req.manager!;
    const body = purchaseInput.parse(req.body);
    requireBranchAccess(req, body.branchId);
    const result = await purchasingService.createPurchase(
      m.companyId,
      body,
      m.managerId,
    );
    req.log.info(
      {
        purchaseId: result.purchase.id,
        branchId: body.branchId,
        items: result.items.length,
        total: result.purchase.total,
      },
      "Purchase received",
    );
    res.status(201).json(result);
  },

  async getPurchase(req: Request, res: Response) {
    const m = req.manager!;
    const id = z.string().uuid().parse(req.params.id);
    const result = await purchasingService.getPurchase(m.companyId, id);
    res.json(result);
  },

  /* ---- Stock ---- */
  async listOnHand(req: Request, res: Response) {
    const m = req.manager!;
    const q = branchQuery.parse(req.query);
    requireBranchAccess(req, q.branchId);
    const stock = await purchasingService.listOnHand(m.companyId, q.branchId);
    res.json({ stock });
  },

  async listMovements(req: Request, res: Response) {
    const m = req.manager!;
    const q = movementsQuery.parse(req.query);
    requireBranchAccess(req, q.branchId);
    const movements = await purchasingService.listMovements(
      m.companyId,
      q.branchId,
      { productClientId: q.productClientId, limit: q.limit },
    );
    res.json({ movements });
  },

  async createAdjustment(req: Request, res: Response) {
    const m = req.manager!;
    const body = adjustmentInput.parse(req.body);
    requireBranchAccess(req, body.branchId);
    const result = await purchasingService.createAdjustment(m.companyId, body);
    req.log.info(
      {
        adjustmentId: result.id,
        branchId: body.branchId,
        productClientId: body.productClientId,
        delta: body.delta,
      },
      "Stock adjustment recorded",
    );
    res.status(201).json(result);
  },
};
