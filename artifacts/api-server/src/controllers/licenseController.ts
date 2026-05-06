import { z } from "zod/v4";
import type { Request, Response } from "express";
import { licenseService } from "../services/licenseService";

const validateBody = z.object({
  licenseKey: z.string().min(4),
  deviceUid: z.string().min(8).max(128),
  name: z.string().max(120).optional(),
  platform: z.enum(["web", "ios", "android", "windows", "macos", "linux", "unknown"]).optional(),
  appVersion: z.string().max(32).optional(),
});

export const licenseController = {
  async validate(req: Request, res: Response) {
    const input = validateBody.parse(req.body);
    const result = await licenseService.validate(input);
    req.log.info(
      { companyId: result.company.id, deviceId: result.device.id },
      "License validated",
    );
    res.json(result);
  },

  me(req: Request, res: Response) {
    res.json({ device: req.device });
  },
};
