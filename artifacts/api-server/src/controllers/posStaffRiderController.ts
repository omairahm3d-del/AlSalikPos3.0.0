import type { Request, Response } from "express";
import {
  staffRiderService,
  upsertStaffInput,
  upsertRiderInput,
} from "../services/staffRiderService";

export const posStaffRiderController = {
  async upsertStaff(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const body = upsertStaffInput.parse(req.body);
    const row = await staffRiderService.upsertStaff(companyId, body);
    res.status(200).json({ staff: row });
  },

  async listStaff(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const rows = await staffRiderService.listStaff(companyId);
    const staff = rows.map((r) => ({
      id: r.clientId,
      name: r.name,
      role: r.role as "admin" | "manager" | "cashier" | "driver",
      pin: r.pin,
      active: r.active,
      createdAt: r.clientCreatedAt,
    }));
    res.json({ staff });
  },

  async upsertRider(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const body = upsertRiderInput.parse(req.body);
    const row = await staffRiderService.upsertRider(companyId, branchId, body);
    res.status(200).json({ rider: row });
  },

  async listRiders(req: Request, res: Response) {
    const companyId = req.device!.companyId;
    const branchId = req.device!.branchId ?? null;
    const rows = await staffRiderService.listRiders(companyId, branchId);
    const riders = rows.map((r) => ({
      id: r.clientId,
      name: r.name,
      phone: r.phone,
      vehicleInfo: r.vehicleInfo,
      active: r.active,
      commissionPct: Number(r.commissionPct),
      createdAt: r.clientCreatedAt,
    }));
    res.json({ riders });
  },
};
