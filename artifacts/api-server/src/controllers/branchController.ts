import { z } from "zod/v4";
import type { Request, Response } from "express";
import { branchService } from "../services/branchService";

const companyIdParam = z.string().uuid();

const createBody = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(500).nullish(),
  isDefault: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(500).nullish(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const branchController = {
  async list(req: Request, res: Response) {
    const companyId = companyIdParam.parse(req.params["companyId"]);
    const branches = await branchService.list(companyId);
    res.json({ branches });
  },

  async create(req: Request, res: Response) {
    const companyId = companyIdParam.parse(req.params["companyId"]);
    const input = createBody.parse(req.body);
    const branch = await branchService.create({ companyId, ...input });
    req.log.info({ companyId, branchId: branch.id }, "Branch created");
    res.status(201).json({ branch });
  },

  async update(req: Request, res: Response) {
    const companyId = companyIdParam.parse(req.params["companyId"]);
    const branchId = z.string().uuid().parse(req.params["branchId"]);
    const input = updateBody.parse(req.body);
    const branch = await branchService.update({
      companyId,
      branchId,
      ...input,
    });
    req.log.info({ companyId, branchId: branch.id }, "Branch updated");
    res.json({ branch });
  },
};
