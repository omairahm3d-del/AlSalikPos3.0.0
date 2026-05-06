import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../lib/env";
import { unauthorized } from "../lib/errors";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const header = req.header("x-admin-api-key");
  if (!header || !safeEqual(header, env.SAAS_ADMIN_API_KEY)) {
    throw unauthorized("admin_unauthorized", "Invalid admin API key");
  }
  next();
};
