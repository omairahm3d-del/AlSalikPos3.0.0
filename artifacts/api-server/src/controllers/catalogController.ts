import type { Request, Response } from "express";
import {
  catalogService,
  pushCatalogInputSchema,
  pullCatalogQuerySchema,
} from "../services/catalogService";
import { unauthorized } from "../lib/errors";

export const catalogController = {
  async push(req: Request, res: Response) {
    const device = req.device;
    if (!device) throw unauthorized("invalid_token", "Device context missing");
    const input = pushCatalogInputSchema.parse(req.body);
    const result = await catalogService.push(input, {
      companyId: device.companyId,
      deviceId: device.deviceId,
      branchId: device.branchId ?? null,
    });
    const productsApplied = result.products.filter(
      (r) => r.status === "applied",
    ).length;
    const categoriesApplied = result.categories.filter(
      (r) => r.status === "applied",
    ).length;
    req.log.info(
      {
        companyId: device.companyId,
        deviceId: device.deviceId,
        productsApplied,
        productsStale: result.products.length - productsApplied,
        categoriesApplied,
        categoriesStale: result.categories.length - categoriesApplied,
      },
      "Catalog pushed",
    );
    res.json(result);
  },

  async pull(req: Request, res: Response) {
    const device = req.device;
    if (!device) throw unauthorized("invalid_token", "Device context missing");
    const query = pullCatalogQuerySchema.parse(req.query);
    const result = await catalogService.pull(query, {
      companyId: device.companyId,
      branchId: device.branchId ?? null,
    });
    req.log.info(
      {
        companyId: device.companyId,
        deviceId: device.deviceId,
        products: result.products.length,
        categories: result.categories.length,
        hasMore: result.hasMore,
      },
      "Catalog pulled",
    );
    res.json(result);
  },
};
