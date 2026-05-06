const BASE = "";

export interface ApiError extends Error {
  status: number;
  code?: string;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = new Error(
      (body as { message?: string } | undefined)?.message ?? res.statusText,
    ) as ApiError;
    err.status = res.status;
    err.code = (body as { code?: string } | undefined)?.code;
    throw err;
  }
  return body as T;
}

export interface LoginRequest {
  companySlug: string;
  email: string;
  password: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  address: string | null;
}

export interface LoginResponse {
  token: string;
  tokenExpiresAt: string;
  manager: { id: string; email: string; name: string; role: string };
  company: { id: string; name: string; slug: string };
  branches: BranchSummary[];
}

export interface SaleRow {
  id: string;
  branchId: string | null;
  clientSaleId: string;
  invoiceNumber: string;
  createdAtClient: string;
  total: string;
  vatAmount: string;
  paymentMethod: string;
  isRefund: boolean;
  staffId: string | null;
  customerId: string | null;
  payload: unknown;
}

export interface SalesSummary {
  count: number;
  total: string;
  vat: string;
}

export interface CatalogRow {
  clientId: string;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
  branchId: string | null;
}

export const api = {
  login: (body: LoginRequest) =>
    request<LoginResponse>("/api/manager/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  branches: (token: string) =>
    request<{ branches: BranchSummary[] }>("/api/manager/branches", { token }),
  sales: (
    token: string,
    branchId: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams({ branchId });
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    if (opts.limit) qs.set("limit", String(opts.limit));
    return request<{ sales: SaleRow[] }>(`/api/manager/sales?${qs}`, { token });
  },
  salesSummary: (
    token: string,
    branchId: string,
    opts: { from?: string; to?: string } = {},
  ) => {
    const qs = new URLSearchParams({ branchId });
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    return request<SalesSummary>(`/api/manager/sales/summary?${qs}`, { token });
  },
  products: (token: string, branchId: string) =>
    request<{ products: CatalogRow[] }>(
      `/api/manager/products?branchId=${branchId}`,
      { token },
    ),
  customers: (token: string, branchId: string) =>
    request<{ customers: CatalogRow[] }>(
      `/api/manager/customers?branchId=${branchId}`,
      { token },
    ),
};
