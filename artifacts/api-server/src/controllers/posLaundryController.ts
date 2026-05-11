import type { Request, Response } from "express";
import {
  laundryService,
  upsertLaundryOrderInput,
  updateLaundryStatusInput,
} from "../services/laundryService";
import { badRequest, notFound } from "../lib/errors";

export const posLaundryController = {
  async upsertOrder(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const deviceId = req.device!.deviceId;
    const body = upsertLaundryOrderInput.parse(req.body);
    const row = await laundryService.upsert(companyId, branchId, deviceId, body);
    res.status(200).json({ order: row });
  },

  async updateStatus(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const clientId = Array.isArray(req.params.clientId)
      ? req.params.clientId[0]
      : req.params.clientId;
    if (!clientId) throw badRequest("missing_param", "clientId is required");
    const body = updateLaundryStatusInput.parse(req.body);
    const row = await laundryService.updateStatus(companyId, clientId, body);
    if (!row) throw notFound("laundry_order_not_found", "Laundry order not found");
    res.json({ order: row });
  },

  async listOrders(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const rows = await laundryService.list(companyId, branchId);

    const orders = rows.map((r) => ({
      id: r.clientId,
      ticketNumber: r.ticketNumber,
      customerId: r.customerId ?? "",
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? "",
      orderType: r.orderType as "drop-off" | "express",
      status: r.status as "received" | "ready" | "collected",
      promisedAt: r.promisedAt,
      notes: r.notes ?? null,
      subtotal: Number(r.subtotal),
      vatAmount: Number(r.vatAmount),
      total: Number(r.total),
      saleId: r.saleId ?? null,
      paidAt: r.paidAt ?? null,
      paymentMethod: r.paymentMethod ?? null,
      staffId: r.staffId ?? null,
      staffName: r.staffName ?? null,
      createdAt: r.clientCreatedAt,
      updatedAt: new Date(r.updatedAt).getTime(),
      items: (r.items as unknown as any[]) ?? [],
    }));

    res.json({ orders });
  },
};
