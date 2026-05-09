import type { Request, Response } from "express";
import { kdsService, upsertHeldOrderInput, kdsStatusInput } from "../services/kdsService";
import { badRequest, notFound } from "../lib/errors";

export const posKdsController = {
  async upsertHeldOrder(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const deviceId = req.device!.deviceId;
    const body = upsertHeldOrderInput.parse(req.body);
    const row = await kdsService.upsert(companyId, branchId, deviceId, body);
    res.status(200).json({ heldOrder: row });
  },

  async listHeldOrders(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const rows = await kdsService.listActive(companyId, branchId);
    res.json({ heldOrders: rows });
  },

  async updateKdsStatus(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const clientId = Array.isArray(req.params.clientId)
      ? req.params.clientId[0]
      : req.params.clientId;
    if (!clientId) throw badRequest("missing_param", "clientId is required");
    const { kdsStatus } = kdsStatusInput.parse(req.body);
    const row = await kdsService.updateStatus(companyId, clientId, kdsStatus);
    if (!row) throw notFound("held_order_not_found", "Held order not found");
    res.json({ heldOrder: row });
  },
};
