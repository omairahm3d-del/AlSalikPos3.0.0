import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { createTestFixture, cleanupAllTestCompanies, type TestFixture } from "./helpers";

let fx: TestFixture;

const BASE_TS = Date.parse("2026-01-01T00:00:00Z");

function entry(id: string, payload: object, updatedAt: number, deleted = false) {
  return { id, payload, updatedAt, deleted };
}

describe("Catalog sync (LWW + pull cursor)", () => {
  beforeAll(async () => {
    fx = await createTestFixture();
  });
  afterAll(cleanupAllTestCompanies);

  it("push: applies a brand-new product", async () => {
    const res = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        products: [entry("prod-1", { name: "Coffee", price: 10 }, BASE_TS)],
      });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].status).toBe("applied");
  });

  it("LWW: an older updatedAt is rejected as stale, payload preserved", async () => {
    // First write at BASE_TS+1000 (newer than initial)
    const newer = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        products: [entry("prod-lww", { name: "Latte v2", price: 15 }, BASE_TS + 1000)],
      });
    expect(newer.body.products[0].status).toBe("applied");

    // Now push an older edit
    const older = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        products: [entry("prod-lww", { name: "Latte v1", price: 12 }, BASE_TS + 500)],
      });
    expect(older.status).toBe(200);
    expect(older.body.products[0].status).toBe("stale");

    // Pull and confirm payload is still v2
    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`);
    expect(pull.status).toBe(200);
    const got = (pull.body.products as Array<{ clientId: string; payload: { name: string } }>)
      .find((p) => p.clientId === "prod-lww");
    expect(got?.payload.name).toBe("Latte v2");
  });

  it("LWW: a strictly newer updatedAt overwrites", async () => {
    await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ products: [entry("prod-lww", { name: "Latte v3", price: 18 }, BASE_TS + 5000)] });

    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`);
    const got = (pull.body.products as Array<{ clientId: string; payload: { name: string } }>)
      .find((p) => p.clientId === "prod-lww");
    expect(got?.payload.name).toBe("Latte v3");
  });

  it("equal updatedAt is treated as stale (no-op)", async () => {
    const res = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({ products: [entry("prod-lww", { name: "Latte v3 again", price: 18 }, BASE_TS + 5000)] });
    expect(res.body.products[0].status).toBe("stale");
  });

  it("tombstone: deleted=true keeps the row but sets deletedAt", async () => {
    await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        products: [entry("prod-tomb", { name: "Donut", price: 5 }, BASE_TS + 100)],
      });
    const del = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({
        products: [entry("prod-tomb", { name: "Donut", price: 5 }, BASE_TS + 200, true)],
      });
    expect(del.body.products[0].status).toBe("applied");

    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`);
    const got = (pull.body.products as Array<{ clientId: string; deletedAt: string | null }>)
      .find((p) => p.clientId === "prod-tomb");
    expect(got?.deletedAt).not.toBeNull();
  });

  it("pull cursor advances and the second pull returns no new rows", async () => {
    const first = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`);
    expect(first.status).toBe(200);
    expect(first.body.cursor).toEqual(expect.any(String));
    const cursor = first.body.cursor;

    const second = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`)
      .query({ since: cursor });
    expect(second.status).toBe(200);
    expect(second.body.products).toHaveLength(0);
    expect(second.body.categories).toHaveLength(0);
    expect(second.body.customers).toHaveLength(0);
  });

  it("pull is isolated by company", async () => {
    const other = await createTestFixture();
    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${other.token}`);
    expect(pull.status).toBe(200);
    expect(pull.body.products).toHaveLength(0);
  });

  it("push without device JWT returns 401", async () => {
    const res = await request(app)
      .post("/api/sync/catalog/push")
      .send({ products: [entry("nope", {}, BASE_TS)] });
    expect(res.status).toBe(401);
  });

  it("rejects empty push payloads (400)", async () => {
    const res = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${fx.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("pull rejects garbage `since` cursor (400 invalid_since)", async () => {
    const res = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${fx.token}`)
      .query({ since: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("categories stream: push then pull round-trips", async () => {
    const isolated = await createTestFixture();
    const push = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${isolated.token}`)
      .send({
        categories: [entry("cat-1", { name: "Drinks" }, BASE_TS + 100)],
      });
    expect(push.status).toBe(200);
    expect(push.body.categories[0].status).toBe("applied");

    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${isolated.token}`);
    expect(pull.status).toBe(200);
    expect(pull.body.categories).toHaveLength(1);
    expect(pull.body.categories[0].clientId).toBe("cat-1");
    expect(pull.body.products).toHaveLength(0);
  });

  it("customers stream: push then pull round-trips", async () => {
    const isolated = await createTestFixture();
    const push = await request(app)
      .post("/api/sync/catalog/push")
      .set("authorization", `Bearer ${isolated.token}`)
      .send({
        customers: [entry("cust-1", { name: "Acme Corp" }, BASE_TS + 200)],
      });
    expect(push.status).toBe(200);
    expect(push.body.customers[0].status).toBe("applied");

    const pull = await request(app)
      .get("/api/sync/catalog/pull")
      .set("authorization", `Bearer ${isolated.token}`);
    expect(pull.status).toBe(200);
    expect(pull.body.customers).toHaveLength(1);
    expect(pull.body.customers[0].clientId).toBe("cust-1");
  });
});
