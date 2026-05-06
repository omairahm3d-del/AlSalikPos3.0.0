import type { Request, Response } from "express";
import { z } from "zod/v4";
import {
  purchasingService,
  supplierInput,
  purchaseInput,
  adjustmentInput,
} from "../services/purchasingService";
import { badRequest, notFound } from "../lib/errors";

/**
 * Device-auth ("POS-side") controllers for purchasing & stock. These mirror
 * the manager handlers but pull `companyId` and `branchId` from the device
 * JWT instead of trusting query params. Devices are pinned to a single
 * branch on activation; we hard-reject any attempt to address a different
 * branch in the URL or body.
 */

function deviceBranchId(req: Request): string {
  const b = req.device?.branchId;
  if (!b) {
    throw badRequest(
      "device_unbound",
      "This device is not bound to a branch. Reactivate to pick a branch.",
    );
  }
  return b;
}

function ensureSameBranch(req: Request, branchId: string) {
  const bound = deviceBranchId(req);
  if (branchId !== bound) {
    throw badRequest(
      "branch_mismatch",
      "Request branch does not match the device's bound branch.",
    );
  }
}

export const posPurchasingController = {
  /* ---- Suppliers ---- */
  async listSuppliers(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const suppliers = await purchasingService.listSuppliers(companyId, branchId);
    res.json({ suppliers });
  },

  async createSupplier(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    // Force the supplier into this device's branch — the POS UI doesn't
    // expose company-wide scope.
    const body = supplierInput.parse({ ...req.body, branchId });
    const supplier = await purchasingService.createSupplier(companyId, body);
    res.status(201).json({ supplier });
  },

  async updateSupplier(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const id = String(req.params.id);
    // Partial update — only fields present in the body are applied.
    // branchId is stripped so the POS can never move a supplier to a
    // different branch (that's a manager-only operation).
    const patch = supplierInput.partial().omit({ branchId: true }).parse(req.body);
    const supplier = await purchasingService.updateSupplier(companyId, id, patch);
    res.json({ supplier });
  },

  /* ---- Purchases ---- */
  async listPurchases(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(req.query);
    const purchases = await purchasingService.listPurchases(
      companyId,
      branchId,
      q,
    );
    res.json({ purchases });
  },

  async createPurchase(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const body = purchaseInput.parse({ ...req.body, branchId });
    ensureSameBranch(req, body.branchId);
    const result = await purchasingService.createPurchase(companyId, body, null);
    req.log.info(
      {
        purchaseId: result.purchase.id,
        branchId,
        items: result.items.length,
        total: result.purchase.total,
        deviceId: req.device!.deviceId,
      },
      "POS purchase received",
    );
    res.status(201).json(result);
  },

  async getPurchase(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const id = z.string().uuid().parse(req.params.id);
    const result = await purchasingService.getPurchase(companyId, id);
    // Defence-in-depth: don't leak another branch's GRN even if the URL is
    // guessed. Return the same `purchase_not_found` error the service throws
    // for a missing row so the response can't be used as an existence
    // oracle for purchases on sibling branches of the same company.
    if (result.purchase.branchId && result.purchase.branchId !== branchId) {
      throw notFound("purchase_not_found", "Purchase not found");
    }
    res.json(result);
  },

  /* ---- Stock ---- */
  async listOnHand(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const stock = await purchasingService.listOnHand(companyId, branchId);
    res.json({ stock });
  },

  async listMovements(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const q = z
      .object({
        productClientId: z.string().min(1).max(128).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(req.query);
    const movements = await purchasingService.listMovements(
      companyId,
      branchId,
      q,
    );
    res.json({ movements });
  },

  async createAdjustment(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = deviceBranchId(req);
    const body = adjustmentInput.parse({ ...req.body, branchId });
    ensureSameBranch(req, body.branchId);
    const result = await purchasingService.createAdjustment(companyId, body);
    req.log.info(
      {
        adjustmentId: result.id,
        branchId,
        productClientId: body.productClientId,
        delta: body.delta,
        deviceId: req.device!.deviceId,
      },
      "POS stock adjustment recorded",
    );
    res.status(201).json(result);
  },
};
