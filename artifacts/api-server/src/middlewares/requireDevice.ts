import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import { unauthorized } from "../lib/errors";

export interface DeviceTokenPayload {
  companyId: string;
  licenseId: string;
  deviceId: string;
  deviceUid: string;
  /**
   * Branch this device is bound to. Optional for back-compat: tokens
   * minted before branches existed lack this claim and are treated as
   * "company default branch" by sync handlers.
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

export const requireDevice: RequestHandler = (req, _res, next) => {
  const auth = req.header("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    throw unauthorized("missing_token", "Bearer token required");
  }
  const token = auth.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, env.SAAS_JWT_SECRET) as DeviceTokenPayload;
    req.device = payload;
    next();
  } catch {
    throw unauthorized("invalid_token", "Token is invalid or expired");
  }
};
