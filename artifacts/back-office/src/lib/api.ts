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

/**
 * Denormalized client-side Sale that lives inside `SaleRow.payload`. It
 * mirrors the POS app's `Sale` type so we can compute Payment / Staff /
 * Rider / Customer / Items aggregates client-side without adding new
 * server endpoints.
 */
export interface SaleItemPayload {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  lineTotal: number;
  discountAmount?: number;
}

export interface SalePayload {
  id: string;
  invoiceNumber: string;
  createdAt: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  orderType?: "dine-in" | "takeaway" | "delivery";
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  riderId?: string;
  riderName?: string;
  discountAmount?: number;
  isRefund?: boolean;
  items?: SaleItemPayload[];
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
  payload: SalePayload;
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
    opts: { from?: string; to?: string; limit?: number; cursor?: string } = {},
  ) => {
    const qs = new URLSearchParams({ branchId });
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    if (opts.limit) qs.set("limit", String(opts.limit));
    if (opts.cursor) qs.set("cursor", opts.cursor);
    return request<{ sales: SaleRow[]; nextCursor: string | null }>(
      `/api/manager/sales?${qs}`,
      { token },
    );
  },
  /**
   * Pages through `/api/manager/sales` until the server reports no further
   * cursor, returning every sale in the date range. Reports MUST use this
   * (not `sales(...)`) so aggregates and CSV exports are not silently
   * truncated at the 500-row server limit.
   */
  salesAll: async (
    token: string,
    branchId: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<SaleRow[]> => {
    const PAGE = 500;
    const HARD_CAP = 50_000; // safety stop; ~100 pages
    const out: SaleRow[] = [];
    let cursor: string | undefined;
    while (out.length < HARD_CAP) {
      const page: { sales: SaleRow[]; nextCursor: string | null } =
        await api.sales(token, branchId, { ...opts, limit: PAGE, cursor });
      out.push(...page.sales);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
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
