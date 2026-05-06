import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { cleanupAllTestCompanies, createTestFixture } from "./helpers";
import { branchService } from "../services/branchService";
import { licenseService } from "../services/licenseService";
import { saasDb, licensesTable } from "@workspace/saas-db";
import { eq } from "drizzle-orm";

/**
 * Smoke tests for the device-auth POS purchasing endpoints. The single-branch
 * fixture auto-binds the device to the company's default branch, so the
 * device JWT already carries `branchId` — every request is automatically
 * scoped without us passing it.
 */

interface Ctx {
  token: string;
  deviceId: string;
}

async function setup(): Promise<Ctx> {
  const fix = await createTestFixture();
  return { token: fix.token, deviceId: fix.deviceId };
}

describe("POS purchasing — device auth", () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(cleanupAllTestCompanies);

  it("creates a supplier, receives stock, and reflects on-hand", async () => {
    const sup = await request(app)
      .post("/api/pos/suppliers")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({ name: "POS Supplier" });
    expect(sup.status).toBe(201);
    const supplierId = sup.body.supplier.id as string;

    const grn = await request(app)
      .post("/api/pos/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        supplierId,
        supplierName: "POS Supplier",
        referenceNumber: "POS-001",
        items: [
          {
            productClientId: "p-pos-1",
            productName: "Tea Bag Box",
            quantity: 12,
            unitCost: 5,
            vatAmount: 3,
          },
        ],
      });
    expect(grn.status).toBe(201);
    expect(grn.body.items).toHaveLength(1);
    expect(Number(grn.body.purchase.total)).toBe(63);

    const stock = await request(app)
      .get("/api/pos/stock")
      .set("authorization", `Bearer ${ctx.token}`);
    expect(stock.status).toBe(200);
    const row = (stock.body.stock as Array<{ productClientId: string; onHand: string }>).find(
      (r) => r.productClientId === "p-pos-1",
    );
    expect(row).toBeDefined();
    expect(Number(row!.onHand)).toBe(12);
  });

  it("idempotency key prevents double-creating a GRN", async () => {
    const idempotencyKey = `pos-key-${Date.now()}`;
    const body = {
      idempotencyKey,
      supplierName: "Walk-in Supplier",
      items: [
        {
          productClientId: "p-pos-idem",
          productName: "Sugar Pack",
          quantity: 4,
          unitCost: 2,
          vatAmount: 0.4,
        },
      ],
    };

    const r1 = await request(app)
      .post("/api/pos/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send(body);
    expect(r1.status).toBe(201);
    const purchaseId = r1.body.purchase.id as string;

    const r2 = await request(app)
      .post("/api/pos/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.purchase.id).toBe(purchaseId); // same row returned

    // Stock should reflect a single application of the GRN, not two.
    const stock = await request(app)
      .get("/api/pos/stock")
      .set("authorization", `Bearer ${ctx.token}`);
    const row = (stock.body.stock as Array<{ productClientId: string; onHand: string }>).find(
      (r) => r.productClientId === "p-pos-idem",
    );
    expect(row).toBeDefined();
    expect(Number(row!.onHand)).toBe(4);
  });

  it("manual adjustment changes on-hand and shows in movements", async () => {
    // Seed via a tiny purchase first.
    await request(app)
      .post("/api/pos/purchases")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        supplierName: "Adj Seed",
        items: [
          {
            productClientId: "p-pos-adj",
            productName: "Adj Item",
            quantity: 10,
            unitCost: 1,
          },
        ],
      })
      .expect(201);

    const adj = await request(app)
      .post("/api/pos/stock/adjustments")
      .set("authorization", `Bearer ${ctx.token}`)
      .send({
        productClientId: "p-pos-adj",
        productName: "Adj Item",
        delta: -3,
        reason: "broken",
      });
    expect(adj.status).toBe(201);
    expect(typeof adj.body.id).toBe("string");

    const moves = await request(app)
      .get(`/api/pos/stock/movements?productClientId=p-pos-adj`)
      .set("authorization", `Bearer ${ctx.token}`);
    expect(moves.status).toBe(200);
    const kinds = (moves.body.movements as Array<{ kind: string }>).map((m) => m.kind);
    expect(kinds).toContain("purchase");
    expect(kinds).toContain("adjustment");

    const stock = await request(app)
      .get("/api/pos/stock")
      .set("authorization", `Bearer ${ctx.token}`);
    const row = (stock.body.stock as Array<{ productClientId: string; onHand: string }>).find(
      (r) => r.productClientId === "p-pos-adj",
    );
    expect(Number(row!.onHand)).toBe(7);
  });

  it("GET /pos/purchases/:id on a sibling-branch GRN returns the same not-found shape (no oracle)", async () => {
    // Build a separate company with two branches, plus a device on each.
    const fix = await createTestFixture({ maxDevices: 5 });
    const branchA = await branchService.ensureDefault(fix.companyId);
    const branchB = await branchService.create({
      companyId: fix.companyId,
      name: "Branch B",
    });

    // The fixture's device is bound to branch A. Activate a second device
    // pinned to branch B by issuing a fresh license + validate.
    const [lic] = await saasDb
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.id, fix.licenseId));
    const validatedB = await licenseService.validate({
      licenseKey: lic!.key,
      deviceUid: `dev-b-${Date.now()}`,
      name: "vitest-b",
      branchId: branchB.id,
    });
    if (validatedB.kind !== "ok") throw new Error("expected ok");
    const tokenA = fix.token; // bound to branchA
    const tokenB = validatedB.token; // bound to branchB

    // Receive stock on branch B.
    const grn = await request(app)
      .post("/api/pos/purchases")
      .set("authorization", `Bearer ${tokenB}`)
      .send({
        supplierName: "Cross-branch supplier",
        items: [{ productClientId: "p-x-branch", productName: "Item X", quantity: 1, unitCost: 1 }],
      })
      .expect(201);
    const purchaseId = grn.body.purchase.id as string;

    // Branch A device requesting branch B's purchase must look identical to
    // a request for a totally bogus uuid — same status, same error code.
    const fromA = await request(app)
      .get(`/api/pos/purchases/${purchaseId}`)
      .set("authorization", `Bearer ${tokenA}`);
    const bogus = await request(app)
      .get(`/api/pos/purchases/00000000-0000-0000-0000-000000000000`)
      .set("authorization", `Bearer ${tokenA}`);

    expect(fromA.status).toBe(bogus.status);
    expect(fromA.body?.error?.code).toBe(bogus.body?.error?.code);
    expect(fromA.body?.error?.code).toBe("purchase_not_found");
  });
});
