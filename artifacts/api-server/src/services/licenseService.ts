import { eq, and, sql } from "drizzle-orm";
import {
  saasDb,
  companiesTable,
  licensesTable,
  devicesTable,
  type Company,
  type License,
  type Device,
} from "@workspace/saas-db";
import { companyRepo } from "../repositories/companyRepo";
import { licenseRepo } from "../repositories/licenseRepo";
import { signDeviceToken } from "../middlewares/requireDevice";
import { generateLicenseKey, normalizeLicenseKey } from "../utils/licenseKey";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";

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
  license: Pick<License, "id" | "expiresAt" | "maxDevices" | "licenseType">;
  device: Pick<Device, "id" | "deviceUid" | "name" | "platform">;
}

export const licenseService = {
  async validate(input: ValidateInput): Promise<ValidateResult> {
    const key = normalizeLicenseKey(input.licenseKey);

    // Run the entire check+upsert in a single transaction with a row lock on
    // the license, so concurrent validations cannot bypass `maxDevices`.
    const result = await saasDb.transaction(async (tx) => {
      // 1) Lock the license row for the duration of the tx.
      const lockedLicenses = await tx
        .select()
        .from(licensesTable)
        .where(eq(licensesTable.key, key))
        .for("update");
      const license = lockedLicenses[0];
      if (!license) {
        throw notFound("license_not_found", "License key is not recognized");
      }
      if (license.status !== "active") {
        throw forbidden("license_revoked", "License has been revoked");
      }
      if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
        throw forbidden("license_expired", "License has expired");
      }

      // 2) Load company (no lock needed; status is read-only here).
      const companyRows = await tx
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.id, license.companyId));
      const company = companyRows[0];
      if (!company) {
        throw notFound(
          "company_not_found",
          "Company not found for this license",
        );
      }
      if (company.status !== "active") {
        throw forbidden("company_suspended", "Company account is suspended");
      }

      // 3) Check if this device is already registered to this license.
      const existingRows = await tx
        .select()
        .from(devicesTable)
        .where(
          and(
            eq(devicesTable.licenseId, license.id),
            eq(devicesTable.deviceUid, input.deviceUid),
          ),
        );
      const existing = existingRows[0];

      // 4) If new, enforce maxDevices under the lock.
      if (!existing) {
        const countRows = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(devicesTable)
          .where(eq(devicesTable.licenseId, license.id));
        const count = countRows[0]?.count ?? 0;
        if (count >= license.maxDevices) {
          throw conflict(
            "device_limit_reached",
            `License device limit reached (${license.maxDevices}). Revoke an existing device or upgrade the license.`,
          );
        }
      }

      // 5) Atomic upsert keyed on (license_id, device_uid).
      const now = new Date();
      const upsertedRows = await tx
        .insert(devicesTable)
        .values({
          companyId: company.id,
          licenseId: license.id,
          deviceUid: input.deviceUid,
          name: input.name ?? null,
          platform: input.platform ?? "unknown",
          appVersion: input.appVersion ?? null,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [devicesTable.licenseId, devicesTable.deviceUid],
          set: {
            name: input.name ?? sql`${devicesTable.name}`,
            platform: input.platform ?? sql`${devicesTable.platform}`,
            appVersion: input.appVersion ?? sql`${devicesTable.appVersion}`,
            lastSeenAt: now,
          },
        })
        .returning();
      const device = upsertedRows[0];
      if (!device) {
        throw new Error("Failed to upsert device");
      }

      return { license, company, device };
    });

    const { token, expiresAt } = signDeviceToken({
      companyId: result.company.id,
      licenseId: result.license.id,
      deviceId: result.device.id,
      deviceUid: result.device.deviceUid,
    });

    return {
      token,
      tokenExpiresAt: expiresAt,
      company: {
        id: result.company.id,
        name: result.company.name,
        slug: result.company.slug,
      },
      license: {
        id: result.license.id,
        expiresAt: result.license.expiresAt,
        maxDevices: result.license.maxDevices,
        licenseType: result.license.licenseType,
      },
      device: {
        id: result.device.id,
        deviceUid: result.device.deviceUid,
        name: result.device.name,
        platform: result.device.platform,
      },
    };
  },

  async issueLicense(input: {
    companyId: string;
    maxDevices?: number;
    expiresAt?: Date | null;
    notes?: string | null;
    licenseType?: "online" | "offline";
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
      licenseType: input.licenseType ?? "online",
    });
  },

  async createCompanyWithLicense(input: {
    name: string;
    slug: string;
    contactEmail?: string | null;
    notes?: string | null;
    maxDevices?: number;
    expiresAt?: Date | null;
    licenseType?: "online" | "offline";
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
      licenseType: input.licenseType,
    });
    return { company, license };
  },
};
