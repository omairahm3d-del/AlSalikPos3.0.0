import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ManagerSession } from "@/lib/session";

interface Props {
  session: ManagerSession;
  onSession: (s: ManagerSession) => void;
  onLogout: () => void;
}

type Tab = "reports" | "products" | "customers";

const TABS: { id: Tab; label: string }[] = [
  { id: "reports", label: "Reports" },
  { id: "products", label: "Products" },
  { id: "customers", label: "Customers" },
];

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Dashboard({ session, onSession, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("reports");
  const branchId = session.branchId ?? session.branches[0]?.id ?? null;

  function setBranch(id: string) {
    onSession({ ...session, branchId: id });
  }

  if (!branchId) {
    return (
      <Shell session={session} onLogout={onLogout}>
        <div className="p-6 text-sm text-gray-600">
          Your company has no active branches. Ask an admin to create one in the
          admin console.
        </div>
      </Shell>
    );
  }

  return (
    <Shell session={session} onLogout={onLogout}>
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-700">Branch:</label>
        <select
          value={branchId}
          onChange={(e) => setBranch(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          {session.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-3 py-1.5 text-sm rounded " +
                (tab === t.id
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {tab === "reports" && (
          <ReportsTab token={session.token} branchId={branchId} />
        )}
        {tab === "products" && (
          <ProductsTab token={session.token} branchId={branchId} />
        )}
        {tab === "customers" && (
          <CustomersTab token={session.token} branchId={branchId} />
        )}
      </div>
    </Shell>
  );
}

function Shell({
  session,
  onLogout,
  children,
}: {
  session: ManagerSession;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <div className="font-semibold text-gray-900">Al Salik Back Office</div>
        <div className="text-sm text-gray-500">{session.company.name}</div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-gray-700">{session.manager.name}</div>
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

function fmtAED(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
  }).format(n);
}

function ReportsTab({ token, branchId }: { token: string; branchId: string }) {
  const [from, setFrom] = useState<string>(startOfTodayISO().slice(0, 10));
  const [to, setTo] = useState<string>("");

  const fromIso = useMemo(
    () => (from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined),
    [from],
  );
  const toIso = useMemo(
    () => (to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined),
    [to],
  );

  const summary = useQuery({
    queryKey: ["sales-summary", branchId, fromIso, toIso],
    queryFn: () =>
      api.salesSummary(token, branchId, { from: fromIso, to: toIso }),
  });
  const sales = useQuery({
    queryKey: ["sales", branchId, fromIso, toIso],
    queryFn: () =>
      api.sales(token, branchId, { from: fromIso, to: toIso, limit: 200 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-sm">
          <div className="text-gray-700 mb-1">From</div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          <div className="text-gray-700 mb-1">To</div>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Sales count"
          value={summary.data ? String(summary.data.count) : "—"}
        />
        <Stat
          label="Total"
          value={summary.data ? fmtAED(summary.data.total) : "—"}
        />
        <Stat
          label="VAT"
          value={summary.data ? fmtAED(summary.data.vat) : "—"}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded">
        <div className="px-4 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
          Recent sales
        </div>
        {sales.isLoading && (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        )}
        {sales.error && (
          <div className="p-4 text-sm text-red-600">
            {String((sales.error as Error).message)}
          </div>
        )}
        {sales.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Payment</th>
                  <th className="px-4 py-2 text-right">VAT</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.sales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No sales in this range.
                    </td>
                  </tr>
                )}
                {sales.data.sales.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{s.invoiceNumber}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {new Date(s.createdAtClient).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 capitalize">{s.paymentMethod}</td>
                    <td className="px-4 py-2 text-right">{fmtAED(s.vatAmount)}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {s.isRefund ? "-" : ""}
                      {fmtAED(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductsTab({ token, branchId }: { token: string; branchId: string }) {
  const q = useQuery({
    queryKey: ["products", branchId],
    queryFn: () => api.products(token, branchId),
  });
  return (
    <CatalogTable
      title="Products"
      isLoading={q.isLoading}
      error={q.error as Error | null}
      rows={q.data?.products ?? []}
      columns={[
        { key: "name", label: "Name" },
        { key: "sku", label: "SKU" },
        { key: "price", label: "Price", align: "right", money: true },
        { key: "stock", label: "Stock", align: "right" },
      ]}
    />
  );
}

function CustomersTab({ token, branchId }: { token: string; branchId: string }) {
  const q = useQuery({
    queryKey: ["customers", branchId],
    queryFn: () => api.customers(token, branchId),
  });
  return (
    <CatalogTable
      title="Customers"
      isLoading={q.isLoading}
      error={q.error as Error | null}
      rows={q.data?.customers ?? []}
      columns={[
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
      ]}
    />
  );
}

interface Col {
  key: string;
  label: string;
  align?: "left" | "right";
  money?: boolean;
}

function CatalogTable({
  title,
  isLoading,
  error,
  rows,
  columns,
}: {
  title: string;
  isLoading: boolean;
  error: Error | null;
  rows: Array<{ clientId: string; payload: Record<string, unknown> }>;
  columns: Col[];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded">
      <div className="px-4 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
        {title}
      </div>
      {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
      {error && (
        <div className="p-4 text-sm text-red-600">{error.message}</div>
      )}
      {!isLoading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={
                      "px-4 py-2 " + (c.align === "right" ? "text-right" : "")
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    Nothing yet for this branch.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.clientId} className="border-t border-gray-100">
                  {columns.map((c) => {
                    const raw = r.payload[c.key];
                    const text =
                      raw == null
                        ? ""
                        : c.money
                          ? fmtAED(String(raw))
                          : String(raw);
                    return (
                      <td
                        key={c.key}
                        className={
                          "px-4 py-2 " +
                          (c.align === "right" ? "text-right" : "")
                        }
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
