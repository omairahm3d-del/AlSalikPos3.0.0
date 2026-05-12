import type { RequestHandler } from "express";
import { companyRepo } from "../repositories/companyRepo";
import { forbidden } from "../lib/errors";

type WorkMode = "standard" | "saloon" | "laundry" | "retail";

/**
 * Simple in-process TTL cache so we don't issue a DB round-trip on every
 * request. Work mode changes (via admin PATCH /companies/:id) are rare, so
 * a 5-minute staleness window is acceptable. Entries are evicted lazily on
 * the next access after their TTL.
 */
const workModeCache = new Map<string, { workMode: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveWorkMode(companyId: string): Promise<string | undefined> {
  const cached = workModeCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.workMode;

  const company = await companyRepo.findById(companyId);
  if (!company) return undefined;

  workModeCache.set(companyId, {
    workMode: company.workMode,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return company.workMode;
}

/**
 * Invalidate the cached work mode for a company. Call this from admin routes
 * that update `work_mode` so the new value takes effect on the next request
 * rather than waiting for the 5-minute TTL to expire.
 */
export function invalidateWorkModeCache(companyId: string): void {
  workModeCache.delete(companyId);
}

/**
 * Middleware factory: blocks the request with 403 `wrong_work_mode` unless
 * the company's `work_mode` is one of the allowed values.
 *
 * Works for both device-auth (req.device) and manager-auth (req.manager)
 * requests — whichever is populated by the preceding middleware.
 *
 * Example:
 *   router.post("/pos/laundry/orders",
 *     requireWorkMode("laundry"),
 *     asyncHandler(posLaundryController.upsertOrder));
 */
export function requireWorkMode(...allowed: WorkMode[]): RequestHandler {
  const allowedSet = new Set<string>(allowed);

  return async (req, _res, next) => {
    const companyId = req.device?.companyId ?? req.manager?.companyId;
    if (!companyId) {
      return next(forbidden("missing_context", "No authenticated company context"));
    }

    try {
      const workMode = await resolveWorkMode(companyId);

      if (!workMode || !allowedSet.has(workMode)) {
        return next(
          forbidden(
            "wrong_work_mode",
            `This endpoint requires work mode: ${allowed.join(" or ")}. ` +
              `Company is configured as: ${workMode ?? "unknown"}.`,
          ),
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
