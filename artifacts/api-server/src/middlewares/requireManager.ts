import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import { unauthorized } from "../lib/errors";
import { managerRepo } from "../repositories/managerRepo";

export interface ManagerTokenPayload {
  kind: "manager";
  managerId: string;
  companyId: string;
  email: string;
  /**
   * Snapshot of `password_hash` at token issue time. We re-check it on
   * every protected request — when an admin resets the password (or the
   * manager themselves changes it later), every previously-issued token
   * is invalidated immediately because `passwordHash` no longer matches.
   * Cheap to verify (string compare in JS), and avoids needing a separate
   * `tokenVersion` column.
   */
  pwh: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      manager?: ManagerTokenPayload;
    }
  }
}

const TTL_SECONDS = 60 * 60 * 12; // 12h

export function signManagerToken(
  payload: Omit<ManagerTokenPayload, "kind">,
): { token: string; expiresAt: Date } {
  const token = jwt.sign(
    { kind: "manager" as const, ...payload },
    env.SAAS_JWT_SECRET,
    { expiresIn: TTL_SECONDS },
  );
  return {
    token,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
  };
}

export const requireManager: RequestHandler = async (req, _res, next) => {
  const auth = req.header("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return next(unauthorized("missing_token", "Bearer token required"));
  }
  const token = auth.slice("Bearer ".length).trim();
  let payload: ManagerTokenPayload;
  try {
    payload = jwt.verify(token, env.SAAS_JWT_SECRET) as ManagerTokenPayload;
  } catch {
    return next(unauthorized("invalid_token", "Token is invalid or expired"));
  }
  if (payload.kind !== "manager") {
    return next(unauthorized("invalid_token", "Token is not a manager token"));
  }
  // Re-check live state so admin deactivations and password resets take
  // effect immediately rather than waiting up to 12h for token expiry.
  try {
    const manager = await managerRepo.findById(payload.managerId);
    if (
      !manager ||
      manager.companyId !== payload.companyId ||
      manager.isActive !== "true" ||
      manager.passwordHash !== payload.pwh
    ) {
      return next(
        unauthorized("session_revoked", "Session is no longer valid"),
      );
    }
    req.manager = payload;
    return next();
  } catch (err) {
    return next(err);
  }
};
