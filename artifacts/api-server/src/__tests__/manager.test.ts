import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { managerService } from "../services/managerService";
import { branchService } from "../services/branchService";
import { saleRepo } from "../repositories/saleRepo";
import { catalogRepo } from "../repositories/catalogRepo";
import {
  cleanupAllTestCompanies,
  createTestFixture,
} from "./helpers";

const ADMIN_KEY = process.env.SAAS_ADMIN_API_KEY!;

interface ManagerCtx {
  companyId: string;
  companySlug: string;
  email: string;
  password: string;
  managerId: string;
  branchAId: string;
  branchBId: string;
  deviceIdA: string;
  deviceIdB: string;
}

async function setupManager(): Promise<ManagerCtx> {
  // Single-branch fixture; we add a second branch + a second device to it.
  const fix = await createTestFixture({ maxDevices: 5 });
  const branchA = await branchService.ensureDefault(fix.companyId);
  const branchB = await branchService.create({
    companyId: fix.companyId,
    name: "Branch B",
  });

  // Bind a 2nd device to branch B by re-validating the same license with a
  // different uid + branchId.
  const { licenseService } = await import("../services/licenseService");
  const { licenseRepo } = await import("../repositories/licenseRepo");
  const lic = (await licenseRepo.listByCompany(fix.companyId))[0]!;
  const r = await licenseService.validate({
    licenseKey: lic.key,
    deviceUid: `${fix.deviceUid}-b`,
    branchId: branchB.id,
  });
  if (r.kind !== "ok") throw new Error("expected ok");

  // Lookup company slug
  const { companyRepo } = await import("../repositories/companyRepo");
  const company = await companyRepo.findById(fix.companyId);
  if (!company) throw new Error("company missing");

  const email = `mgr+${Date.now()}@test.local`;
  const password = "supersecret123";
  const m = await managerService.create({
    companyId: fix.companyId,
    email,
    name: "Test Manager",
    password,
  });

  // Seed: one sale per branch, one product per branch, one customer per branch.
  await saleRepo.bulkInsert([
    {
      companyId: fix.companyId,
      deviceId: fix.deviceId,
      branchId: branchA.id,
      clientSaleId: `sa-${Date.now()}`,
      invoiceNumber: "INV-A-1",
      createdAtClient: new Date(),
      total: "100.0000",
      vatAmount: "5.0000",
      paymentMethod: "cash",
      isRefund: false,
      originalClientSaleId: null,
      staffId: null,
      customerId: null,
      payload: {},
    },
    {
      companyId: fix.companyId,
      deviceId: r.device.id,
      branchId: branchB.id,
      clientSaleId: `sb-${Date.now()}`,
      invoiceNumber: "INV-B-1",
      createdAtClient: new Date(),
      total: "200.0000",
      vatAmount: "10.0000",
      paymentMethod: "card",
      isRefund: false,
      originalClientSaleId: null,
      staffId: null,
      customerId: null,
      payload: {},
    },
  ]);
  await catalogRepo.upsertProducts(fix.companyId, fix.deviceId, branchA.id, [
    {
      clientId: `pa-${Date.now()}`,
      payload: { name: "Coffee A", price: 12 },
      clientUpdatedAt: new Date(),
      deletedAt: null,
    },
  ]);
  await catalogRepo.upsertProducts(fix.companyId, r.device.id, branchB.id, [
    {
      clientId: `pb-${Date.now()}`,
      payload: { name: "Tea B", price: 8 },
      clientUpdatedAt: new Date(),
      deletedAt: null,
    },
  ]);

  return {
    companyId: fix.companyId,
    companySlug: company.slug,
    email,
    password,
    managerId: m.id,
    branchAId: branchA.id,
    branchBId: branchB.id,
    deviceIdA: fix.deviceId,
    deviceIdB: r.device.id,
  };
}

describe("Manager auth + branch-scoped reads", () => {
  let ctx: ManagerCtx;

  beforeAll(async () => {
    ctx = await setupManager();
  });
  afterAll(cleanupAllTestCompanies);

  it("rejects bad password (401 invalid_credentials)", async () => {
    const res = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: "wrong-password",
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("requires bearer for protected routes", async () => {
    const res = await request(app).get("/api/manager/branches");
    expect(res.status).toBe(401);
  });

  it("logs in, lists branches, and reads sales scoped per branch", async () => {
    const login = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: ctx.password,
      });
    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.branches).toHaveLength(2);
    const token = login.body.token as string;

    const branches = await request(app)
      .get("/api/manager/branches")
      .set("authorization", `Bearer ${token}`);
    expect(branches.status).toBe(200);
    expect(branches.body.branches.map((b: { id: string }) => b.id)).toEqual(
      expect.arrayContaining([ctx.branchAId, ctx.branchBId]),
    );

    const salesA = await request(app)
      .get(`/api/manager/sales?branchId=${ctx.branchAId}`)
      .set("authorization", `Bearer ${token}`);
    expect(salesA.status).toBe(200);
    expect(salesA.body.sales).toHaveLength(1);
    expect(salesA.body.sales[0].invoiceNumber).toBe("INV-A-1");

    const salesB = await request(app)
      .get(`/api/manager/sales?branchId=${ctx.branchBId}`)
      .set("authorization", `Bearer ${token}`);
    expect(salesB.status).toBe(200);
    expect(salesB.body.sales).toHaveLength(1);
    expect(salesB.body.sales[0].invoiceNumber).toBe("INV-B-1");

    const sumA = await request(app)
      .get(`/api/manager/sales/summary?branchId=${ctx.branchAId}`)
      .set("authorization", `Bearer ${token}`);
    expect(sumA.status).toBe(200);
    expect(sumA.body.count).toBe(1);
    expect(Number(sumA.body.total)).toBe(100);
    expect(Number(sumA.body.vat)).toBe(5);

    const prodB = await request(app)
      .get(`/api/manager/products?branchId=${ctx.branchBId}`)
      .set("authorization", `Bearer ${token}`);
    expect(prodB.status).toBe(200);
    expect(prodB.body.products).toHaveLength(1);
    expect(
      (prodB.body.products[0].payload as { name: string }).name,
    ).toBe("Tea B");
  });

  it("rejects branchId from another company (404 branch_not_found)", async () => {
    const login = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: ctx.password,
      });
    const token = login.body.token as string;

    // Create an unrelated company + branch.
    const otherSlug = `other-${Date.now()}`;
    const other = await request(app)
      .post("/api/admin/companies")
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ name: `Other ${otherSlug}`, slug: otherSlug });
    expect(other.status).toBe(201);
    const otherCompanyId = other.body.company.id as string;
    const { trackCompany } = await import("./helpers");
    trackCompany(otherCompanyId);
    const otherBranchRes = await request(app)
      .post(`/api/admin/companies/${otherCompanyId}/branches`)
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ name: "Foreign Branch" });
    expect(otherBranchRes.status).toBe(201);
    const foreignBranchId = otherBranchRes.body.branch.id as string;

    const res = await request(app)
      .get(`/api/manager/sales?branchId=${foreignBranchId}`)
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("branch_not_found");
  });

  it("paginates sales via cursor when range exceeds the per-request limit", async () => {
    // Seed 12 sales on branch A so we can page in chunks of 5.
    const base = Date.now();
    const extra = Array.from({ length: 12 }, (_, i) => ({
      companyId: ctx.companyId,
      deviceId: ctx.deviceIdA,
      branchId: ctx.branchAId,
      clientSaleId: `pg-${base}-${i}`,
      invoiceNumber: `INV-PG-${i}`,
      // Spread timestamps so DESC ordering is stable + deterministic.
      createdAtClient: new Date(base - i * 1000),
      total: "10.0000",
      vatAmount: "0.5000",
      paymentMethod: "cash" as const,
      isRefund: false,
      originalClientSaleId: null,
      staffId: null,
      customerId: null,
      payload: { seq: i },
    }));
    await saleRepo.bulkInsert(extra);

    const login = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: ctx.password,
      });
    const token = login.body.token as string;

    const all: { id: string; invoiceNumber: string }[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const qs = new URLSearchParams({
        branchId: ctx.branchAId,
        limit: "5",
      });
      if (cursor) qs.set("cursor", cursor);
      const res = await request(app)
        .get(`/api/manager/sales?${qs}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      all.push(...res.body.sales);
      cursor = res.body.nextCursor ?? undefined;
      pages += 1;
      if (pages > 10) throw new Error("paged forever");
    } while (cursor);

    // Should have walked all 12 seeded + the 1 from setup = 13, with no dupes.
    const ids = new Set(all.map((s) => s.id));
    expect(ids.size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(13);
    // Pages should be > 1 to actually exercise the cursor.
    expect(pages).toBeGreaterThan(1);
  });

  it("admin password reset revokes existing manager tokens", async () => {
    const login = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: ctx.password,
      });
    const token = login.body.token as string;

    // Token works before reset
    const before = await request(app)
      .get("/api/manager/branches")
      .set("authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    // Admin resets the password
    const reset = await request(app)
      .post(`/api/admin/companies/${ctx.companyId}/managers/${ctx.managerId}/password`)
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ newPassword: "brand-new-pw-9999" });
    expect(reset.status).toBe(200);

    // Existing token is now revoked
    const after = await request(app)
      .get("/api/manager/branches")
      .set("authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("session_revoked");

    // New password works
    const relogin = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: "brand-new-pw-9999",
      });
    expect(relogin.status).toBe(200);
    // Restore for subsequent tests in case ordering matters.
    ctx.password = "brand-new-pw-9999";
  });

  it("admin deactivation revokes existing manager tokens", async () => {
    const login = await request(app)
      .post("/api/manager/login")
      .send({
        companySlug: ctx.companySlug,
        email: ctx.email,
        password: ctx.password,
      });
    const token = login.body.token as string;

    const deactivate = await request(app)
      .patch(`/api/admin/companies/${ctx.companyId}/managers/${ctx.managerId}/active`)
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);

    const after = await request(app)
      .get("/api/manager/branches")
      .set("authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("session_revoked");

    // Re-activate to keep the rest of the suite stable
    await request(app)
      .patch(`/api/admin/companies/${ctx.companyId}/managers/${ctx.managerId}/active`)
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ isActive: true });
  });

  it("admin can list managers for the company", async () => {
    const list = await request(app)
      .get(`/api/admin/companies/${ctx.companyId}/managers`)
      .set("x-admin-api-key", ADMIN_KEY);
    expect(list.status).toBe(200);
    expect(
      list.body.managers.find((m: { id: string }) => m.id === ctx.managerId),
    ).toBeTruthy();
  });
});
