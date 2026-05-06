import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { cleanupAllTestCompanies, trackCompany, uniqueSlug } from "./helpers";

const ADMIN_KEY = process.env.SAAS_ADMIN_API_KEY!;

describe("Admin auth (x-admin-api-key)", () => {
  afterAll(cleanupAllTestCompanies);

  it("rejects requests with no admin key (401)", async () => {
    const res = await request(app).get("/api/admin/companies");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("admin_unauthorized");
  });

  it("rejects requests with a wrong admin key (401)", async () => {
    const res = await request(app)
      .get("/api/admin/companies")
      .set("x-admin-api-key", "definitely-wrong-key");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("admin_unauthorized");
  });

  it("rejects an admin key of a different length (no timing-equal crash)", async () => {
    const res = await request(app)
      .get("/api/admin/companies")
      .set("x-admin-api-key", "a"); // length mismatch — must not throw
    expect(res.status).toBe(401);
  });

  it("accepts the configured admin key (200)", async () => {
    const res = await request(app)
      .get("/api/admin/companies")
      .set("x-admin-api-key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.companies)).toBe(true);
  });

  it("create-company round-trip: returns the one-time license key once", async () => {
    const slug = uniqueSlug("admin");
    const res = await request(app)
      .post("/api/admin/companies")
      .set("x-admin-api-key", ADMIN_KEY)
      .send({ name: `Admin Test ${slug}`, slug, maxDevices: 2 });

    expect(res.status).toBe(201);
    expect(res.body.company.id).toEqual(expect.any(String));
    expect(res.body.license.key).toEqual(expect.any(String));
    expect(res.body.license.maxDevices).toBe(2);
    // Register for cleanup — the admin endpoint bypasses the helper that
    // normally tracks created companies.
    trackCompany(res.body.company.id);

    // Subsequently listing licenses for that company returns the key
    // (admin needs to see it for support purposes).
    const list = await request(app)
      .get(`/api/admin/companies/${res.body.company.id}/licenses`)
      .set("x-admin-api-key", ADMIN_KEY);
    expect(list.status).toBe(200);
    expect(list.body.licenses[0].key).toBe(res.body.license.key);
  });
});
