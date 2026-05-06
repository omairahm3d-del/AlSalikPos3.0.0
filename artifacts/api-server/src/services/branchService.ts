import { branchRepo } from "../repositories/branchRepo";
import { companyRepo } from "../repositories/companyRepo";
import { badRequest, conflict, notFound } from "../lib/errors";
import type { Branch } from "@workspace/saas-db";

export const branchService = {
  async list(companyId: string): Promise<Branch[]> {
    return branchRepo.listByCompany(companyId);
  },

  async listActive(companyId: string): Promise<Branch[]> {
    return branchRepo.listActiveByCompany(companyId);
  },

  /**
   * Ensures the company has at least one branch. If none exists, creates a
   * default "Main" branch and returns it. Used both by the backfill script
   * and at runtime when a license activates against a company that has not
   * yet been migrated to the multi-branch model.
   */
  async ensureDefault(companyId: string): Promise<Branch> {
    const existingDefault = await branchRepo.findDefault(companyId);
    if (existingDefault) return existingDefault;
    // No default flagged; pick the first branch if any exist.
    const all = await branchRepo.listByCompany(companyId);
    const first = all[0];
    if (first) {
      // Promote the first branch to default for predictability.
      const updated = await branchRepo.update(first.id, companyId, {
        isDefault: true,
      });
      return updated ?? first;
    }
    return branchRepo.create({
      companyId,
      name: "Main",
      address: null,
      isDefault: true,
      isActive: true,
    });
  },

  async create(input: {
    companyId: string;
    name: string;
    address?: string | null;
    isDefault?: boolean;
  }): Promise<Branch> {
    const company = await companyRepo.findById(input.companyId);
    if (!company) throw notFound("company_not_found", "Company not found");
    const trimmed = input.name.trim();
    if (!trimmed) throw badRequest("invalid_name", "Branch name is required");
    const existing = await branchRepo.listByCompany(input.companyId);
    if (existing.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      throw conflict(
        "branch_name_taken",
        `A branch named "${trimmed}" already exists for this company`,
      );
    }
    // First branch ever is the default unless caller says otherwise.
    const isDefault = input.isDefault ?? existing.length === 0;
    if (isDefault) {
      // Demote any prior default — only one default per company.
      for (const b of existing.filter((b) => b.isDefault)) {
        await branchRepo.update(b.id, input.companyId, { isDefault: false });
      }
    }
    return branchRepo.create({
      companyId: input.companyId,
      name: trimmed,
      address: input.address ?? null,
      isDefault,
      isActive: true,
    });
  },

  async update(input: {
    branchId: string;
    companyId: string;
    name?: string;
    address?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
  }): Promise<Branch> {
    const branch = await branchRepo.findById(input.branchId);
    if (!branch || branch.companyId !== input.companyId) {
      throw notFound("branch_not_found", "Branch not found");
    }
    const patch: Partial<
      Pick<Branch, "name" | "address" | "isActive" | "isDefault">
    > = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw badRequest("invalid_name", "Branch name is required");
      const existing = await branchRepo.listByCompany(input.companyId);
      if (
        existing.some(
          (b) =>
            b.id !== input.branchId &&
            b.name.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        throw conflict(
          "branch_name_taken",
          `A branch named "${trimmed}" already exists for this company`,
        );
      }
      patch.name = trimmed;
    }
    if (input.address !== undefined) patch.address = input.address;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.isDefault === true && !branch.isDefault) {
      const existing = await branchRepo.listByCompany(input.companyId);
      for (const b of existing.filter((b) => b.isDefault && b.id !== input.branchId)) {
        await branchRepo.update(b.id, input.companyId, { isDefault: false });
      }
      patch.isDefault = true;
    }
    const updated = await branchRepo.update(
      input.branchId,
      input.companyId,
      patch,
    );
    if (!updated) throw notFound("branch_not_found", "Branch not found");
    return updated;
  },
};
