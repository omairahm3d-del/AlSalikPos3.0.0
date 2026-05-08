import { z } from "zod/v4";
import type { Request, Response } from "express";
import { licenseService } from "../services/licenseService";
import { managerService } from "../services/managerService";
import { companyRepo } from "../repositories/companyRepo";
import { licenseRepo } from "../repositories/licenseRepo";
import { deviceRepo } from "../repositories/deviceRepo";
import { notFound } from "../lib/errors";

const isoDate = z.iso
  .datetime()
  .transform((s: string) => new Date(s));

const licenseTypeEnum = z.enum(["online", "offline"]);

const workModeEnum = z.enum(["standard", "saloon"]);

const createCompanyBody = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(63),
  contactEmail: z.email().optional(),
  notes: z.string().max(1000).optional(),
  maxDevices: z.number().int().min(1).max(1000).optional(),
  expiresAt: isoDate.nullable().optional(),
  licenseType: licenseTypeEnum.optional(),
  workMode: workModeEnum.optional(),
});

const updateCompanyBody = z.object({
  workMode: workModeEnum,
});

const issueLicenseBody = z.object({
  companyId: z.string().uuid(),
  maxDevices: z.number().int().min(1).max(1000).optional(),
  expiresAt: isoDate.nullable().optional(),
  notes: z.string().max(1000).optional(),
  licenseType: licenseTypeEnum.optional(),
});

const revokeLicenseParams = z.object({
  companyId: z.string().uuid(),
  licenseId: z.string().uuid(),
});

const deviceParams = z.object({
  companyId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

const setDeviceLimitBody = z.object({
  maxDevices: z.number().int().min(1).max(1000),
});

const extendLicenseBody = z.object({
  expiresAt: isoDate.nullable(),
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

  async updateCompany(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const { workMode } = updateCompanyBody.parse(req.body);
    const company = await companyRepo.update(companyId, { workMode });
    if (!company) throw notFound("company_not_found", "Company not found");
    req.log.info({ companyId, workMode }, "Company updated");
    res.json({ company });
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

  async extendLicense(req: Request, res: Response) {
    const { companyId, licenseId } = revokeLicenseParams.parse(req.params);
    const { expiresAt } = extendLicenseBody.parse(req.body);
    const license = await licenseRepo.extend(licenseId, companyId, expiresAt);
    if (!license) throw notFound("license_not_found", "License not found");
    req.log.info({ licenseId, expiresAt }, "License extended");
    res.json({ license });
  },

  async setDeviceLimit(req: Request, res: Response) {
    const { companyId, licenseId } = revokeLicenseParams.parse(req.params);
    const { maxDevices } = setDeviceLimitBody.parse(req.body);
    const license = await licenseRepo.setMaxDevices(licenseId, companyId, maxDevices);
    if (!license) throw notFound("license_not_found", "License not found");
    req.log.info({ licenseId, maxDevices }, "License device limit updated");
    res.json({ license });
  },

  async deleteLicense(req: Request, res: Response) {
    const { companyId, licenseId } = revokeLicenseParams.parse(req.params);
    const deleted = await licenseRepo.deleteLicense(licenseId, companyId);
    if (!deleted) throw notFound("license_not_found", "License not found");
    req.log.info({ licenseId }, "License deleted");
    res.json({ ok: true });
  },

  async removeDevice(req: Request, res: Response) {
    const { companyId, deviceId } = deviceParams.parse(req.params);
    const deleted = await deviceRepo.deleteDevice(deviceId, companyId);
    if (!deleted) throw notFound("device_not_found", "Device not found");
    req.log.info({ deviceId }, "Device removed");
    res.json({ ok: true });
  },

  async listManagers(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const managers = await managerService.listForCompany(companyId);
    res.json({ managers });
  },

  async createManager(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const body = z
      .object({
        email: z.string().min(3).max(255),
        name: z.string().min(1).max(200),
        password: z.string().min(8).max(200),
        role: z.string().min(1).max(50).optional(),
      })
      .parse(req.body);
    const manager = await managerService.create({ companyId, ...body });
    req.log.info({ companyId, managerId: manager.id }, "Manager created");
    res.status(201).json({
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: manager.role,
      },
    });
  },

  async setManagerActive(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const managerId = z.string().uuid().parse(req.params["managerId"]);
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const manager = await managerService.setActive({
      companyId,
      managerId,
      isActive: body.isActive,
    });
    res.json({
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: manager.role,
        isActive: manager.isActive === "true",
      },
    });
  },

  async resetManagerPassword(req: Request, res: Response) {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const managerId = z.string().uuid().parse(req.params["managerId"]);
    const body = z.object({ newPassword: z.string().min(8).max(200) }).parse(
      req.body,
    );
    await managerService.resetPassword({
      companyId,
      managerId,
      newPassword: body.newPassword,
    });
    res.json({ ok: true });
  },
};
