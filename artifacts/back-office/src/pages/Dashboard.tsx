import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ManagerSession } from "@/lib/session";
import ReportsHub from "./ReportsHub";
import SuppliersTab from "./SuppliersTab";
import PurchasesTab from "./PurchasesTab";
import StockTab from "./StockTab";
import { fmtAED } from "@/lib/csv";

interface Props {
  session: ManagerSession;
  onSession: (s: ManagerSession) => void;
  onLogout: () => void;
}

type Tab =
  | "reports"
  | "stock"
  | "purchases"
  | "suppliers"
  | "products"
  | "customers";

const TABS: { id: Tab; label: string }[] = [
  { id: "reports", label: "Reports" },
  { id: "stock", label: "Stock" },
  { id: "purchases", label: "Purchases" },
  { id: "suppliers", label: "Suppliers" },
  { id: "products", label: "Products" },
  { id: "customers", label: "Customers" },
];

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
          <ReportsHub token={session.token} branchId={branchId} />
        )}
        {tab === "stock" && (
          <StockTab token={session.token} branchId={branchId} />
        )}
        {tab === "purchases" && (
          <PurchasesTab token={session.token} branchId={branchId} />
        )}
        {tab === "suppliers" && (
          <SuppliersTab token={session.token} branchId={branchId} />
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

