import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createTestCompany,
  createTestFixture,
  createExpiredLicense,
  revokeLicenseDirect,
  suspendCompanyDirect,
  cleanupAllTestCompanies,
} from "./helpers";

describe("POST /api/license/validate", () => {
  afterAll(cleanupAllTestCompanies);

  it("happy path: valid key + new device returns 200 + token", async () => {
    const { licenseKey } = await createTestCompany({ maxDevices: 1 });
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "happy-device-001", platform: "linux" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.tokenExpiresAt).toEqual(expect.any(String));
    expect(res.body.company.id).toEqual(expect.any(String));
    expect(res.body.device.deviceUid).toBe("happy-device-001");
    expect(res.body.license.maxDevices).toBe(1);
  });

  it("re-validating the same device is idempotent (no count increment)", async () => {
    const { licenseKey } = await createTestCompany({ maxDevices: 1 });
    const a = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "same-uid" });
    const b = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "same-uid" });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.device.id).toBe(a.body.device.id);
  });

  it("unknown key returns 404 license_not_found", async () => {
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey: "DEFINITELY-NOT-A-KEY-12345", deviceUid: "abcdef12" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("license_not_found");
  });

  it("revoked license returns 403 license_revoked", async () => {
    const { licenseId, licenseKey } = await createTestCompany();
    await revokeLicenseDirect(licenseId);
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "another-device" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("license_revoked");
  });

  it("expired license returns 403 license_expired", async () => {
    const { licenseKey } = await createExpiredLicense();
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "expired-device" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("license_expired");
  });

  it("suspended company returns 403 company_suspended", async () => {
    const { companyId, licenseKey } = await createTestCompany();
    await suspendCompanyDirect(companyId);
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "suspended-device" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("company_suspended");
  });

  it("enforces maxDevices: 2nd new device on a 1-device license is rejected", async () => {
    const { licenseKey } = await createTestCompany({ maxDevices: 1 });
    const first = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "device-A" });
    const second = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey, deviceUid: "device-B" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("device_limit_reached");
  });

  it("rejects malformed body with 400", async () => {
    const res = await request(app)
      .post("/api/license/validate")
      .send({ licenseKey: "x", deviceUid: "short" });
    // licenseKey must be >=4, deviceUid must be >=8; either trips zod
    expect(res.status).toBe(400);
  });
});

describe("GET /api/me", () => {
  afterAll(cleanupAllTestCompanies);

  it("returns the device payload when bearer token is valid", async () => {
    const fx = await createTestFixture();
    const res = await request(app)
      .get("/api/me")
      .set("authorization", `Bearer ${fx.token}`);
    expect(res.status).toBe(200);
    expect(res.body.device.deviceId).toBe(fx.deviceId);
    expect(res.body.device.companyId).toBe(fx.companyId);
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("missing_token");
  });

  it("returns 401 when token is garbage", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_token");
  });
});
