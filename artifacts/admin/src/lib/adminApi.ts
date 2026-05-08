import { getAdminKey, clearAdminKey } from "./adminAuth";

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactEmail: string | null;
  notes: string | null;
  workMode?: "standard" | "saloon";
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCompanyInput {
  workMode: "standard" | "saloon";
}

export type LicenseType = "online" | "offline";

export interface License {
  id: string;
  companyId: string;
  key: string;
  maxDevices: number;
  expiresAt: string | null;
  status: string;
  licenseType: LicenseType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchInput {
  name: string;
  address?: string | null;
  isDefault?: boolean;
}

export interface UpdateBranchInput {
  name?: string;
  address?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface Manager {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateManagerInput {
  email: string;
  name: string;
  password: string;
  role?: string;
}

export interface Device {
  id: string;
  companyId: string;
  licenseId: string;
  deviceUid: string;
  name: string | null;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  contactEmail?: string;
  notes?: string;
  maxDevices?: number;
  expiresAt?: string | null;
  licenseType?: LicenseType;
}

export interface IssueLicenseInput {
  companyId: string;
  maxDevices?: number;
  expiresAt?: string | null;
  notes?: string;
  licenseType?: LicenseType;
}

export interface ExtendLicenseInput {
  expiresAt: string | null;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getAdminKey();
  if (!key) {
    throw new AdminApiError("Admin API key not set", 401, "no_admin_key");
  }
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-api-key": key,
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    clearAdminKey();
    throw new AdminApiError(
      "Admin key was rejected. Please re-enter your key.",
      res.status,
      "invalid_admin_key",
    );
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.code) code = body.error.code;
    } catch {
      // ignore parse error
    }
    throw new AdminApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const adminApi = {
  listCompanies(): Promise<{ companies: Company[] }> {
    return request("/companies");
  },
  createCompany(
    input: CreateCompanyInput,
  ): Promise<{ company: Company; license: License }> {
    return request("/companies", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listCompanyLicenses(companyId: string): Promise<{ licenses: License[] }> {
    return request(`/companies/${companyId}/licenses`);
  },
  listCompanyDevices(companyId: string): Promise<{ devices: Device[] }> {
    return request(`/companies/${companyId}/devices`);
  },
  issueLicense(input: IssueLicenseInput): Promise<{ license: License }> {
    return request("/licenses", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  revokeLicense(
    companyId: string,
    licenseId: string,
  ): Promise<{ license: License }> {
    return request(`/companies/${companyId}/licenses/${licenseId}/revoke`, {
      method: "POST",
    });
  },
  extendLicense(
    companyId: string,
    licenseId: string,
    input: ExtendLicenseInput,
  ): Promise<{ license: License }> {
    return request(`/companies/${companyId}/licenses/${licenseId}/extend`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  setDeviceLimit(
    companyId: string,
    licenseId: string,
    maxDevices: number,
  ): Promise<{ license: License }> {
    return request(`/companies/${companyId}/licenses/${licenseId}/devices`, {
      method: "PATCH",
      body: JSON.stringify({ maxDevices }),
    });
  },
  deleteLicense(companyId: string, licenseId: string): Promise<{ ok: true }> {
    return request(`/companies/${companyId}/licenses/${licenseId}`, {
      method: "DELETE",
    });
  },
  removeDevice(companyId: string, deviceId: string): Promise<{ ok: true }> {
    return request(`/companies/${companyId}/devices/${deviceId}`, {
      method: "DELETE",
    });
  },
  listBranches(companyId: string): Promise<{ branches: Branch[] }> {
    return request(`/companies/${companyId}/branches`);
  },
  createBranch(
    companyId: string,
    input: CreateBranchInput,
  ): Promise<{ branch: Branch }> {
    return request(`/companies/${companyId}/branches`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateBranch(
    companyId: string,
    branchId: string,
    input: UpdateBranchInput,
  ): Promise<{ branch: Branch }> {
    return request(`/companies/${companyId}/branches/${branchId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  listManagers(companyId: string): Promise<{ managers: Manager[] }> {
    return request(`/companies/${companyId}/managers`);
  },
  createManager(
    companyId: string,
    input: CreateManagerInput,
  ): Promise<{ manager: Pick<Manager, "id" | "email" | "name" | "role"> }> {
    return request(`/companies/${companyId}/managers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  setManagerActive(
    companyId: string,
    managerId: string,
    isActive: boolean,
  ): Promise<{ manager: Pick<Manager, "id" | "email" | "name" | "role" | "isActive"> }> {
    return request(`/companies/${companyId}/managers/${managerId}/active`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  },
  resetManagerPassword(
    companyId: string,
    managerId: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    return request(`/companies/${companyId}/managers/${managerId}/password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
  },
  updateCompany(
    companyId: string,
    input: UpdateCompanyInput,
  ): Promise<{ company: Company }> {
    return request(`/companies/${companyId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  /**
   * Verifies the stored admin key by hitting the cheapest authenticated
   * endpoint. Throws AdminApiError on failure.
   */
  async ping(): Promise<void> {
    await request("/companies");
  },
};
