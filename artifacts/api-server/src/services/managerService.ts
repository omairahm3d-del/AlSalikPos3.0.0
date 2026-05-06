import { managerRepo } from "../repositories/managerRepo";
import { companyRepo } from "../repositories/companyRepo";
import { branchRepo } from "../repositories/branchRepo";
import { hashPassword, verifyPassword } from "../utils/password";
import { signManagerToken } from "../middlewares/requireManager";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors";
import type { Branch, Company, Manager } from "@workspace/saas-db";

export interface LoginInput {
  companySlug: string;
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  tokenExpiresAt: Date;
  manager: Pick<Manager, "id" | "email" | "name" | "role">;
  company: Pick<Company, "id" | "name" | "slug">;
  branches: Array<Pick<Branch, "id" | "name" | "address">>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const managerService = {
  async login(input: LoginInput): Promise<LoginResult> {
    const slug = input.companySlug.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (!slug || !email || !input.password) {
      throw badRequest(
        "invalid_credentials",
        "Company, email, and password are required",
      );
    }
    const company = await companyRepo.findBySlug(slug);
    if (!company) {
      throw unauthorized("invalid_credentials", "Invalid credentials");
    }
    if (company.status !== "active") {
      throw unauthorized("company_suspended", "Company account is suspended");
    }
    const manager = await managerRepo.findByCompanyAndEmail(company.id, email);
    if (!manager || manager.isActive !== "true") {
      throw unauthorized("invalid_credentials", "Invalid credentials");
    }
    const ok = await verifyPassword(input.password, manager.passwordHash);
    if (!ok) {
      throw unauthorized("invalid_credentials", "Invalid credentials");
    }
    await managerRepo.update(manager.id, company.id, {
      lastLoginAt: new Date(),
    });
    const branches = await branchRepo.listActiveByCompany(company.id);
    const { token, expiresAt } = signManagerToken({
      managerId: manager.id,
      companyId: company.id,
      email: manager.email,
      pwh: manager.passwordHash,
    });
    return {
      token,
      tokenExpiresAt: expiresAt,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: manager.role,
      },
      company: { id: company.id, name: company.name, slug: company.slug },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
      })),
    };
  },

  async listForCompany(companyId: string) {
    const rows = await managerRepo.listByCompany(companyId);
    return rows.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      isActive: m.isActive === "true",
      lastLoginAt: m.lastLoginAt,
      createdAt: m.createdAt,
    }));
  },

  async create(input: {
    companyId: string;
    email: string;
    name: string;
    password: string;
    role?: string;
  }): Promise<Manager> {
    const company = await companyRepo.findById(input.companyId);
    if (!company) throw notFound("company_not_found", "Company not found");
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw badRequest("invalid_email", "A valid email is required");
    }
    const name = input.name.trim();
    if (!name) throw badRequest("invalid_name", "Name is required");
    if (input.password.length < 8) {
      throw badRequest(
        "weak_password",
        "Password must be at least 8 characters",
      );
    }
    const existing = await managerRepo.findByCompanyAndEmail(
      input.companyId,
      email,
    );
    if (existing) {
      throw conflict(
        "email_taken",
        `A manager with email "${email}" already exists for this company`,
      );
    }
    const passwordHash = await hashPassword(input.password);
    return managerRepo.create({
      companyId: input.companyId,
      email,
      name,
      passwordHash,
      role: input.role ?? "manager",
      isActive: "true",
    });
  },

  async setActive(input: {
    companyId: string;
    managerId: string;
    isActive: boolean;
  }): Promise<Manager> {
    const updated = await managerRepo.update(
      input.managerId,
      input.companyId,
      { isActive: input.isActive ? "true" : "false" },
    );
    if (!updated) throw notFound("manager_not_found", "Manager not found");
    return updated;
  },

  async resetPassword(input: {
    companyId: string;
    managerId: string;
    newPassword: string;
  }): Promise<void> {
    if (input.newPassword.length < 8) {
      throw badRequest(
        "weak_password",
        "Password must be at least 8 characters",
      );
    }
    const passwordHash = await hashPassword(input.newPassword);
    const updated = await managerRepo.update(
      input.managerId,
      input.companyId,
      { passwordHash },
    );
    if (!updated) throw notFound("manager_not_found", "Manager not found");
  },
};
