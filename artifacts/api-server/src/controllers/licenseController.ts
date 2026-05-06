import { z } from "zod/v4";
import type { Request, Response } from "express";
import { licenseService } from "../services/licenseService";

const validateBody = z.object({
  licenseKey: z.string().min(4),
  deviceUid: z.string().min(8).max(128),
  name: z.string().max(120).optional(),
  platform: z.enum(["web", "ios", "android", "windows", "macos", "linux", "unknown"]).optional(),
  appVersion: z.string().max(32).optional(),
  /**
   * Optional branch the device is activating against. If omitted and the
   * company has more than one active branch the server returns the branch
   * list with `needsBranchSelection: true` so the client can prompt.
   */
  branchId: z.string().uuid().optional(),
});

export const licenseController = {
  async validate(req: Request, res: Response) {
    const input = validateBody.parse(req.body);
    const result = await licenseService.validate(input);
    if (result.kind === "needs_branch_selection") {
      req.log.info(
        {
          companyId: result.company.id,
          branchCount: result.branches.length,
        },
        "License validated — branch selection required",
      );
      // 200 with a discriminated payload — clients gate on `kind`. We
      // intentionally do not use 4xx because this isn't an error: it's a
      // valid step in the activation handshake.
      res.json(result);
      return;
    }
    req.log.info(
      {
        companyId: result.company.id,
        deviceId: result.device.id,
        branchId: result.branch.id,
      },
      "License validated",
    );
    res.json(result);
  },

  me(req: Request, res: Response) {
    res.json({ device: req.device });
  },
};
