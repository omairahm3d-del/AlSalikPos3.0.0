import { eq, inArray } from "drizzle-orm";
import { saasDb, companiesTable, licensesTable } from "@workspace/saas-db";
import { licenseService } from "../services/licenseService";
import { licenseRepo } from "../repositories/licenseRepo";
import { generateLicenseKey } from "../utils/licenseKey";

/**
 * Each test creates its own company with a unique slug. All downstream rows
 * (licenses, devices, sales, catalog) cascade-delete on company removal, so
 * cleanup is one statement per company.
 */
const createdCompanyIds = new Set<string>();

/**
 * Track a company id for cleanup. Use when a test creates a company through
 * a path that bypasses the helpers (e.g. via the admin API directly).
 */
export function trackCompany(id: string): void {
  createdCompanyIds.add(id);
}

export function uniqueSlug(prefix = "test"): string {
  // Slug must match /^[a-z0-9][a-z0-9-]{1,62}$/.
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${rand}`.toLowerCase();
}

export interface TestFixture {
  companyId: string;
  licenseId: string;
  licenseKey: string;
  deviceId: string;
  deviceUid: string;
  token: string;
}

export async function createTestFixture(opts: {
  maxDevices?: number;
} = {}): Promise<TestFixture> {
  const slug = uniqueSlug("vt");
  const { company, license } = await licenseService.createCompanyWithLicense({
    name: `Vitest ${slug}`,
    slug,
    maxDevices: opts.maxDevices ?? 1,
  });
  createdCompanyIds.add(company.id);

  const deviceUid = `dev-${slug}`;
  const validated = await licenseService.validate({
    licenseKey: license.key,
    deviceUid,
    name: "vitest",
    platform: "linux",
  });

  return {
    companyId: company.id,
    licenseId: license.id,
    licenseKey: license.key,
    deviceId: validated.device.id,
    deviceUid,
    token: validated.token,
  };
}

export async function createTestCompany(
  opts: { maxDevices?: number } = {},
): Promise<{ companyId: string; licenseId: string; licenseKey: string }> {
  const slug = uniqueSlug("vt");
  const { company, license } = await licenseService.createCompanyWithLicense({
    name: `Vitest ${slug}`,
    slug,
    maxDevices: opts.maxDevices ?? 1,
  });
  createdCompanyIds.add(company.id);
  return { companyId: company.id, licenseId: license.id, licenseKey: license.key };
}

export async function revokeLicenseDirect(licenseId: string): Promise<void> {
  await saasDb
    .update(licensesTable)
    .set({ status: "revoked" })
    .where(eq(licensesTable.id, licenseId));
}

/**
 * Create a company plus an already-expired license (bypasses
 * licenseService.createCompanyWithLicense, which doesn't backdate).
 */
export async function createExpiredLicense(): Promise<{
  companyId: string;
  licenseKey: string;
}> {
  const slug = uniqueSlug("vt-exp");
  const { company } = await licenseService.createCompanyWithLicense({
    name: `Vitest expired ${slug}`,
    slug,
  });
  createdCompanyIds.add(company.id);
  const key = generateLicenseKey();
  await licenseRepo.create({
    companyId: company.id,
    key,
    maxDevices: 1,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    notes: "expired test license",
    status: "active",
  });
  return { companyId: company.id, licenseKey: key };
}

export async function suspendCompanyDirect(companyId: string): Promise<void> {
  await saasDb
    .update(companiesTable)
    .set({ status: "suspended" })
    .where(eq(companiesTable.id, companyId));
}

export async function cleanupAllTestCompanies(): Promise<void> {
  if (createdCompanyIds.size === 0) return;
  const ids = Array.from(createdCompanyIds);
  await saasDb.delete(companiesTable).where(inArray(companiesTable.id, ids));
  createdCompanyIds.clear();
}
