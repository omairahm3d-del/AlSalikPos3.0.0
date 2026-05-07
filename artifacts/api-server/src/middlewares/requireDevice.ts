import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { saasDb, devicesTable } from "@workspace/saas-db";
import { env } from "../lib/env";
import { unauthorized } from "../lib/errors";
import { branchRepo } from "../repositories/branchRepo";

export interface DeviceTokenPayload {
  companyId: string;
  licenseId: string;
  deviceId: string;
  deviceUid: string;
  /**
   * Branch this device is bound to. Optional for back-compat: tokens
   * minted before branches existed lack this claim. The middleware
   * back-fills it from the device DB row (which is always stamped on
   * activation) so downstream handlers can always rely on it being set.
   */
  branchId?: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: DeviceTokenPayload;
    }
  }
}

export function signDeviceToken(payload: DeviceTokenPayload): {
  token: string;
  expiresAt: Date;
} {
  const expiresIn = env.JWT_TTL_SECONDS;
  const token = jwt.sign(payload, env.SAAS_JWT_SECRET, { expiresIn });
  return {
    token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

/**
 * Verify the device Bearer JWT and attach the payload to req.device.
 *
 * Back-compat: tokens issued before the branch system don't carry a
 * `branchId` claim. We resolve it lazily from the device DB row (stamped
 * on every license activation) so all downstream handlers can rely on
 * req.device.branchId being populated without forcing a re-activation.
 */
export const requireDevice: RequestHandler = async (req, _res, next) => {
  const auth = req.header("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return next(unauthorized("missing_token", "Bearer token required"));
  }
  const token = auth.slice("Bearer ".length).trim();
  let payload: DeviceTokenPayload;
  try {
    payload = jwt.verify(token, env.SAAS_JWT_SECRET) as DeviceTokenPayload;
  } catch {
    return next(unauthorized("invalid_token", "Token is invalid or expired"));
  }

  // Back-fill branchId for legacy tokens that pre-date the branch system.
  if (!payload.branchId && payload.deviceId) {
    try {
      const device = await saasDb.query.devicesTable.findFirst({
        where: eq(devicesTable.id, payload.deviceId),
      });
      if (device?.branchId) {
        payload = { ...payload, branchId: device.branchId };
      } else {
        // Device row also lacks branchId (truly pre-backfill) — use the
        // company's default branch so stock tracking starts working
        // immediately without forcing a re-activation.
        const defaultBranch = await branchRepo.findDefault(payload.companyId);
        if (defaultBranch) {
          payload = { ...payload, branchId: defaultBranch.id };
        }
      }
    } catch {
      // Non-fatal: continue without branchId; purchasing endpoints will
      // still throw device_unbound, but sync/catalog routes keep working.
    }
  }

  req.device = payload;
  next();
};
