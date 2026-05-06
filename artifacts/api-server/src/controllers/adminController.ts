import { z } from "zod/v4";
import type { Request, Response } from "express";
import { licenseService } from "../services/licenseService";
import { companyRepo } from "../repositories/companyRepo";
import { licenseRepo } from "../repositories/licenseRepo";
import { deviceRepo } from "../repositories/deviceRepo";
import { notFound } from "../lib/errors";

const isoDate = z.iso
  .datetime()
  .transform((s: string) => new Date(s));

const createCompanyBody = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(63),
  contactEmail: z.email().optional(),
  notes: z.string().max(1000).optional(),
  maxDevices: z.number().int().min(1).max(1000).optional(),
  expiresAt: isoDate.nullable().optional(),
});

const issueLicenseBody = z.object({
  companyId: z.string().uuid(),
  maxDevices: z.number().int().min(1).max(1000).optional(),
  expiresAt: isoDate.nullable().optional(),
  notes: z.string().max(1000).optional(),
});

const revokeLicenseParams = z.object({
  companyId: z.string().uuid(),
  licenseId: z.string().uuid(),
});

export const adminController = {
  async createCompany(req: Request, res: Response) {
    const input = createCompanyBody.parse(req.body);
    const result = await licenseService.createCompanyWithLicense(input);
    req.log.info({ companyId: result.company.id }, "Company created");
    res.status(201).json(result);
  },

  async listCompanies(_req: Request, res: Response) {
    const companies = await companyRepo.list();
    res.json({ companies });
  },

  async issueLicense(req: Request, res: Response) {
    const input = issueLicenseBody.parse(req.body);
    const license = await licenseService.issueLicense(input);
    req.log.info({ licenseId: license.id }, "License issued");
    res.status(201).json({ license });
  },

  async listCompanyLicenses(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const licenses = await licenseRepo.listByCompany(companyId);
    res.json({ licenses });
  },

  async listCompanyDevices(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const devices = await deviceRepo.listByCompany(companyId);
    res.json({ devices });
  },

  async revokeLicense(req: Request, res: Response) {
    const { companyId, licenseId } = revokeLicenseParams.parse(req.params);
    const license = await licenseRepo.revoke(licenseId, companyId);
    if (!license) throw notFound("license_not_found", "License not found");
    res.json({ license });
  },
};
