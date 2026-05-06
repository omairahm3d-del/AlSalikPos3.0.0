import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { createTestFixture, cleanupAllTestCompanies, type TestFixture } from "./helpers";

let fx: TestFixture;

function makeSale(id: string, overrides: Partial<{ total: number; vat: number }> = {}) {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    createdAt: Date.now() - 1_000,
    total: overrides.total ?? 100,
    vatAmount: overrides.vat ?? 5,
    paymentMethod: "cash",
  };
}

describe("POST /api/sync/sales (idempotent push)", () => {
  beforeAll(async () => {
    fx = await createTestFixture();
  });
  afterAll(cleanupAllTestCompanies);

  it("first push of a batch inserts every row", async () => {
    const sales = [makeSale("sale-A1"), makeSale("sale-A2"), makeSale("sale-A3")];
    const res = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ sales });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(3);
    expect(res.body.duplicates).toBe(0);
    expect(res.body.results).toHaveLength(3);
    for (const r of res.body.results) {
      expect(r.status).toBe("inserted");
      expect(r.serverId).toEqual(expect.any(String));
    }
  });

  it("re-pushing the same batch reports all rows as duplicates", async () => {
    const sales = [makeSale("sale-A1"), makeSale("sale-A2"), makeSale("sale-A3")];
    const res = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ sales });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(0);
    expect(res.body.duplicates).toBe(3);
  });

  it("mixed batch (some new, some seen) reports each row correctly", async () => {
    const sales = [
      makeSale("sale-A1"), // already seen
      makeSale("sale-B1"), // new
      makeSale("sale-A2"), // already seen
      makeSale("sale-B2"), // new
    ];
    const res = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ sales });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);
    expect(res.body.duplicates).toBe(2);
    const byId = Object.fromEntries(
      (res.body.results as Array<{ clientSaleId: string; status: string }>).map(
        (r) => [r.clientSaleId, r.status],
      ),
    );
    expect(byId["sale-A1"]).toBe("duplicate");
    expect(byId["sale-A2"]).toBe("duplicate");
    expect(byId["sale-B1"]).toBe("inserted");
    expect(byId["sale-B2"]).toBe("inserted");
  });

  it("rejects a batch containing duplicate ids with 400", async () => {
    const dup = makeSale("sale-DUP");
    const res = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ sales: [dup, dup] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("duplicate_in_batch");
  });

  it("requires a device JWT (401 without)", async () => {
    const res = await request(app)
      .post("/api/sync/sales")
      .send({ sales: [makeSale("sale-noauth")] });
    expect(res.status).toBe(401);
  });

  it("rejects amounts with too many decimal places (400)", async () => {
    const res = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        sales: [
          { ...makeSale("sale-bad-amt"), total: 1.123456 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("isolates sales by company: a different company's device cannot see them", async () => {
    const other = await createTestFixture();
    // Push a row for fx, then push the same client id for `other` — both
    // succeed because (companyId, clientSaleId) is the unique key, not
    // clientSaleId alone. This guards against cross-tenant collision.
    const sale = makeSale("sale-shared-id");
    const r1 = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ sales: [sale] });
    const r2 = await request(app)
      .post("/api/sync/sales")
      .set("authorization", `Bearer ${other.token}`)
      .send({ sales: [sale] });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.results[0].status).toBe("inserted");
    expect(r2.body.results[0].status).toBe("inserted");
    expect(r1.body.results[0].serverId).not.toBe(r2.body.results[0].serverId);
  });
});
