import type { Request, Response } from "express";
import { syncService, pushSalesInputSchema } from "../services/syncService";
import { unauthorized } from "../lib/errors";

export const syncController = {
  async pushSales(req: Request, res: Response) {
    const device = req.device;
    if (!device) throw unauthorized("invalid_token", "Device context missing");
    const input = pushSalesInputSchema.parse(req.body);
    const result = await syncService.pushSales(input, {
      companyId: device.companyId,
      deviceId: device.deviceId,
    });
    req.log.info(
      {
        companyId: device.companyId,
        deviceId: device.deviceId,
        inserted: result.inserted,
        duplicates: result.duplicates,
      },
      "Sales pushed",
    );
    res.json(result);
  },
};
