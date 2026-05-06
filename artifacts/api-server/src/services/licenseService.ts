import { companyRepo } from "../repositories/companyRepo";
import { licenseRepo } from "../repositories/licenseRepo";
import { deviceRepo } from "../repositories/deviceRepo";
import { signDeviceToken } from "../middlewares/requireDevice";
import { generateLicenseKey, normalizeLicenseKey } from "../utils/licenseKey";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import type { Company, License, Device } from "@workspace/saas-db";

export interface ValidateInput {
  licenseKey: string;
  deviceUid: string;
  name?: string;
  platform?: string;
  appVersion?: string;
}

export interface ValidateResult {
  token: string;
  tokenExpiresAt: Date;
  company: Pick<Company, "id" | "name" | "slug">;
  license: Pick<License, "id" | "expiresAt" | "maxDevices">;
  device: Pick<Device, "id" | "deviceUid" | "name" | "platform">;
}

export const licenseService = {
  async validate(input: ValidateInput): Promise<ValidateResult> {
    const key = normalizeLicenseKey(input.licenseKey);
    const license = await licenseRepo.findByKey(key);
    if (!license) {
      throw notFound("license_not_found", "License key is not recognized");
    }
    if (license.status !== "active") {
      throw forbidden("license_revoked", "License has been revoked");
    }
    if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      throw forbidden("license_expired", "License has expired");
    }

    const company = await companyRepo.findById(license.companyId);
    if (!company) {
      throw notFound("company_not_found", "Company not found for this license");
    }
    if (company.status !== "active") {
      throw forbidden("company_suspended", "Company account is suspended");
    }

    // Enforce maxDevices: count distinct devices already registered to this license
    const existing = await deviceRepo.findByLicenseAndUid(
      license.id,
      input.deviceUid,
    );
    if (!existing) {
      const count = await deviceRepo.countByLicense(license.id);
      if (count >= license.maxDevices) {
        throw conflict(
          "device_limit_reached",
          `License device limit reached (${license.maxDevices}). Revoke an existing device or upgrade the license.`,
        );
      }
    }

    const device = await deviceRepo.upsert({
      companyId: company.id,
      licenseId: license.id,
      deviceUid: input.deviceUid,
      name: input.name ?? null,
      platform: input.platform ?? "unknown",
      appVersion: input.appVersion ?? null,
    });

    const { token, expiresAt } = signDeviceToken({
      companyId: company.id,
      licenseId: license.id,
      deviceId: device.id,
      deviceUid: device.deviceUid,
    });

    return {
      token,
      tokenExpiresAt: expiresAt,
      company: { id: company.id, name: company.name, slug: company.slug },
      license: {
        id: license.id,
        expiresAt: license.expiresAt,
        maxDevices: license.maxDevices,
      },
      device: {
        id: device.id,
        deviceUid: device.deviceUid,
        name: device.name,
        platform: device.platform,
      },
    };
  },

  async issueLicense(input: {
    companyId: string;
    maxDevices?: number;
    expiresAt?: Date | null;
    notes?: string | null;
  }): Promise<License> {
    const company = await companyRepo.findById(input.companyId);
    if (!company) {
      throw notFound("company_not_found", "Company not found");
    }
    const key = generateLicenseKey();
    return licenseRepo.create({
      companyId: company.id,
      key,
      maxDevices: input.maxDevices ?? 1,
      expiresAt: input.expiresAt ?? null,
      notes: input.notes ?? null,
      status: "active",
    });
  },

  async createCompanyWithLicense(input: {
    name: string;
    slug: string;
    contactEmail?: string | null;
    notes?: string | null;
    maxDevices?: number;
    expiresAt?: Date | null;
  }): Promise<{ company: Company; license: License }> {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      throw badRequest(
        "invalid_slug",
        "Slug must be lowercase alphanumerics and dashes (2-63 chars)",
      );
    }
    const existing = await companyRepo.findBySlug(slug);
    if (existing) {
      throw conflict("slug_taken", `Slug "${slug}" is already in use`);
    }
    const company = await companyRepo.create({
      name: input.name,
      slug,
      status: "active",
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
    });
    const license = await this.issueLicense({
      companyId: company.id,
      maxDevices: input.maxDevices,
      expiresAt: input.expiresAt,
    });
    return { company, license };
  },
};
