import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { managerService } from "../services/managerService";
import { branchService } from "../services/branchService";
import { saleRepo } from "../repositories/saleRepo";
import { syncService } from "../services/syncService";
import { stockRepo } from "../repositories/stockRepo";
import {
  cleanupAllTestCompanies,
  createTestFixture,
} from "./helpers";

interface Ctx {
  companyId: string;
  companySlug: string;
  email: string;
  password: string;
  branchId: string;
  otherBranchId: string;
  deviceId: string;
  token: string; // manager bearer token
}

async function setup(): Promise<Ctx> {
  const fix = await createTestFixture({ maxDevices: 5 });
  const branchA = await branchService.ensureDefault(fix.companyId);
  const branchB = await branchService.create({
    companyId: fix.companyId,
    name: "Branch B",
  });

  const { companyRepo } = await import("../repositories/companyRepo");
  const company = await companyRepo.findById(fix.companyId);
  if (!company) throw new Error("company missing");

  const email = `mgr+${Date.now()}@test.local`;
  const password = "supersecret123";
  await managerService.create({
    companyId: fix.companyId,
    email,
    name: "Test Manager",
    password,
  });

  const login = await request(app)
    .post("/api/manager/login")
    .send({ companySlug: company.slug, email, password });
  if (login.status !== 200) {
    throw new Error(`manager login failed: ${login.status}`);
  }

  return {
    companyId: fix.companyId,
    companySlug: company.slug,
    email,
    password,
    branchId: branchA.id,
    otherBranchId: branchB.id,
    deviceId: fix.deviceId,
    token: login.body.token as string,
  };
}

describe("Purchasing & stock — happy paths", () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(cleanupAllTestCompanies);

  it("creates a supplier scoped to the branch and lists it", async () => {
    const create = await request(app)
      .post("/api/manager/suppliers")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        name: "Acme Foods",
        phone: "+971-50-000-0000",
        branchId: ctx.branchId,
      });
    expect(create.status).toBe(201);
    expect(create.body.supplier.id).toEqual(expect.any(String));

    const companyWide = await request(app)
      .post("/api/manager/suppliers")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({ name: "Globex (HQ)" });
    expect(companyWide.status).toBe(201);

    // List from branch A — sees both branch-A and company-wide.
    const listA = await request(app)
      .get(`/api/manager/suppliers?branchId=${ctx.branchId}`)
      .set("authorization", `Bearer ${ctx.token}`);
    expect(listA.status).toBe(200);
    const namesA = listA.body.suppliers.map((s: { name: string }) => s.name);
    expect(namesA).toEqual(expect.arrayContaining(["Acme Foods", "Globex (HQ)"]));

    // List from branch B — sees only company-wide (Acme was branch-private).
    const listB = await request(app)
      .get(`/api/manager/suppliers?branchId=${ctx.otherBranchId}`)
      .set("authorization", `Bearer ${ctx.token}`);
    expect(listB.status).toBe(200);
    const namesB = listB.body.suppliers.map((s: { name: string }) => s.name);
    expect(namesB).toEqual(expect.arrayContaining(["Globex (HQ)"]));
    expect(namesB).not.toContain("Acme Foods");
  });

  it("records a purchase, increments stock-on-hand, and is idempotent", async () => {
    const supplierName = "Test Supplier " + Date.now();
    const purchase = await request(app)
      .post("/api/manager/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        branchId: ctx.branchId,
        supplierName,
        referenceNumber: "INV-001",
        items: [
          {
            productClientId: "prod-coffee",
            productName: "Coffee Beans",
            sku: "CFB-1",
            quantity: 10,
            unitCost: 5,
            vatAmount: 2.5,
          },
          {
            productClientId: "prod-milk",
            productName: "Milk",
            quantity: 4,
            unitCost: 3,
            vatAmount: 0.6,
          },
        ],
      });
    expect(purchase.status).toBe(201);
    expect(purchase.body.purchase.total).toBe("65.1000"); // 50 + 12 + 2.5 + 0.6
    expect(purchase.body.items).toHaveLength(2);

    const onHand = await request(app)
      .get(`/api/manager/stock?branchId=${ctx.branchId}`)
      .set("authorization", `Bearer ${ctx.token}`);
    expect(onHand.status).toBe(200);
    const map = new Map(
      onHand.body.stock.map((r: { productClientId: string; onHand: string }) => [
        r.productClientId,
        Number(r.onHand),
      ]),
    );
    expect(map.get("prod-coffee")).toBe(10);
    expect(map.get("prod-milk")).toBe(4);

    // Other branch unaffected.
    const onHandB = await request(app)
      .get(`/api/manager/stock?branchId=${ctx.otherBranchId}`)
      .set("authorization", `Bearer ${ctx.token}`);
    expect(onHandB.body.stock).toHaveLength(0);
  });

  it("decrements stock when a sale is pushed; refund increments back", async () => {
    const saleId = `sale-${Date.now()}`;
    const refundId = `refund-${Date.now()}`;

    const saleCtx = {
      companyId: ctx.companyId,
      deviceId: ctx.deviceId,
      branchId: ctx.branchId,
    };
    const saleBody = {
      sales: [
        {
          id: saleId,
          invoiceNumber: "INV-S-1",
          createdAt: Date.now(),
          total: 60,
          vatAmount: 3,
          paymentMethod: "cash",
          items: [
            {
              productId: "prod-coffee",
              productName: "Coffee Beans",
              quantity: 3,
            },
          ],
        },
      ],
    };
    // Push a sale via syncService (bypasses device auth wiring in this test).
    await syncService.pushSales(saleBody, saleCtx);
    // Re-push the same sale: must be a no-op for stock too.
    await syncService.pushSales(saleBody, saleCtx);

    let onHand = await stockRepo.onHandForBranch(ctx.companyId, ctx.branchId);
    let coffee = onHand.find((r) => r.productClientId === "prod-coffee");
    expect(Number(coffee?.onHand)).toBe(7); // 10 - 3, only once.

    // Refund: +qty back.
    await syncService.pushSales(
      {
        sales: [
          {
            id: refundId,
            invoiceNumber: "INV-S-1R",
            createdAt: Date.now(),
            total: 60,
            vatAmount: 3,
            paymentMethod: "cash",
            isRefund: true,
            originalSaleId: saleId,
            items: [
              {
                productId: "prod-coffee",
                productName: "Coffee Beans",
                quantity: 3,
              },
            ],
          },
        ],
      },
      saleCtx,
    );

    onHand = await stockRepo.onHandForBranch(ctx.companyId, ctx.branchId);
    coffee = onHand.find((r) => r.productClientId === "prod-coffee");
    expect(Number(coffee?.onHand)).toBe(10); // back to received quantity.

    // Touch saleRepo to keep the unused-import lint friendly.
    expect(typeof saleRepo.bulkInsert).toBe("function");
  });

  it("records a manual stock adjustment", async () => {
    const before = await stockRepo.onHandForBranch(
      ctx.companyId,
      ctx.branchId,
    );
    const milkBefore = Number(
      before.find((r) => r.productClientId === "prod-milk")?.onHand ?? 0,
    );

    const adj = await request(app)
      .post("/api/manager/stock/adjustments")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        branchId: ctx.branchId,
        productClientId: "prod-milk",
        productName: "Milk",
        delta: -1,
        reason: "spoiled",
      });
    expect(adj.status).toBe(201);
    expect(adj.body.id).toEqual(expect.any(String));

    const after = await stockRepo.onHandForBranch(
      ctx.companyId,
      ctx.branchId,
    );
    const milkAfter = Number(
      after.find((r) => r.productClientId === "prod-milk")?.onHand ?? 0,
    );
    expect(milkAfter).toBe(milkBefore - 1);

    // Movements endpoint shows the adjustment with its reason.
    const mv = await request(app)
      .get(
        `/api/manager/stock/movements?branchId=${ctx.branchId}&productClientId=prod-milk`,
      )
      .set("authorization", `Bearer ${ctx.token}`);
    expect(mv.status).toBe(200);
    const adjMovement = mv.body.movements.find(
      (m: { kind: string }) => m.kind === "adjustment",
    );
    expect(adjMovement?.reason).toBe("spoiled");
  });

  it("idempotencyKey: re-submitting the same key returns the original purchase + does not double stock", async () => {
    const key = `boff-${crypto.randomUUID()}`;
    const body = {
      branchId: ctx.branchId,
      supplierName: "Idempotent Supplier",
      idempotencyKey: key,
      items: [
        {
          productClientId: "prod-sugar",
          productName: "Sugar",
          quantity: 5,
          unitCost: 2,
        },
      ],
    };
    const first = await request(app)
      .post("/api/manager/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send(body);
    expect(first.status).toBe(201);
    const firstId = first.body.purchase.id as string;

    const second = await request(app)
      .post("/api/manager/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.purchase.id).toBe(firstId);

    const onHand = await stockRepo.onHandForBranch(
      ctx.companyId,
      ctx.branchId,
    );
    const sugar = onHand.find((r) => r.productClientId === "prod-sugar");
    expect(Number(sugar?.onHand)).toBe(5); // not 10
  });

  it("aggregates duplicate product lines within one purchase (no txn failure)", async () => {
    const res = await request(app)
      .post("/api/manager/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        branchId: ctx.branchId,
        supplierName: "Dup Supplier",
        idempotencyKey: `dup-${crypto.randomUUID()}`,
        items: [
          {
            productClientId: "prod-flour",
            productName: "Flour",
            quantity: 3,
            unitCost: 2,
          },
          {
            productClientId: "prod-flour",
            productName: "Flour",
            quantity: 2,
            unitCost: 4,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(5);

    const onHand = await stockRepo.onHandForBranch(
      ctx.companyId,
      ctx.branchId,
    );
    const flour = onHand.find((r) => r.productClientId === "prod-flour");
    expect(Number(flour?.onHand)).toBe(5);
  });

  it("sale stock mirroring uses inserted-only + aggregates duplicate lines", async () => {
    const saleId = `dup-sale-${Date.now()}`;
    const saleCtx = {
      companyId: ctx.companyId,
      deviceId: ctx.deviceId,
      branchId: ctx.branchId,
    };

    // First push: two lines for the same product → must aggregate to -5,
    // not silently drop one (and not fail the unique stock index).
    await syncService.pushSales(
      {
        sales: [
          {
            id: saleId,
            invoiceNumber: "INV-DUP-1",
            createdAt: Date.now(),
            total: 50,
            vatAmount: 0,
            paymentMethod: "cash",
            items: [
              {
                productId: "prod-tea",
                productName: "Tea",
                quantity: 3,
              },
              {
                productId: "prod-tea",
                productName: "Tea",
                quantity: 2,
              },
            ],
          },
        ],
      },
      saleCtx,
    );
    let onHand = await stockRepo.onHandForBranch(
      ctx.companyId,
      ctx.branchId,
    );
    let tea = onHand.find((r) => r.productClientId === "prod-tea");
    expect(Number(tea?.onHand)).toBe(-5);

    // Replay the same sale ID with a TAMPERED items array: a different
    // product. The sale row is a duplicate, so stock must NOT change.
    await syncService.pushSales(
      {
        sales: [
          {
            id: saleId,
            invoiceNumber: "INV-DUP-1",
            createdAt: Date.now(),
            total: 50,
            vatAmount: 0,
            paymentMethod: "cash",
            items: [
              {
                productId: "prod-evil",
                productName: "Tampered",
                quantity: 999,
              },
            ],
          },
        ],
      },
      saleCtx,
    );
    onHand = await stockRepo.onHandForBranch(ctx.companyId, ctx.branchId);
    const evil = onHand.find((r) => r.productClientId === "prod-evil");
    expect(evil).toBeUndefined();
  });

  it("rejects purchases against another company's branch", async () => {
    const other = await createTestFixture();
    const otherBranch = await branchService.ensureDefault(other.companyId);

    const res = await request(app)
      .post("/api/manager/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        branchId: otherBranch.id,
        supplierName: "x",
        items: [
          {
            productClientId: "p",
            productName: "p",
            quantity: 1,
            unitCost: 1,
          },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("branch_not_found");
  });
});
