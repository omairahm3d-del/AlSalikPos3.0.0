import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiPackage, ApiPackageInput } from "@/lib/api";
import type { ManagerSession as ManagerSessionType } from "@/lib/session";
import ReportsHub from "./ReportsHub";
import SuppliersTab from "./SuppliersTab";
import PurchasesTab from "./PurchasesTab";
import StockTab from "./StockTab";
import { fmtAED, buildCsv, downloadCsv } from "@/lib/csv";

interface Props {
  session: ManagerSessionType;
  onSession: (s: ManagerSessionType) => void;
  onLogout: () => void;
}

type Tab =
  | "reports"
  | "stock"
  | "purchases"
  | "suppliers"
  | "products"
  | "customers"
  | "packages"
  | "orders";

function buildTabs(isSaloon: boolean, isLaundry: boolean): { id: Tab; label: string }[] {
  const tabs: { id: Tab; label: string }[] = [
    { id: "reports", label: "Reports" },
    { id: "stock", label: "Stock" },
    { id: "purchases", label: "Purchases" },
    { id: "suppliers", label: "Suppliers" },
    { id: "products", label: isSaloon ? "Services" : "Products" },
    { id: "customers", label: "Customers" },
  ];
  if (isSaloon) tabs.push({ id: "packages", label: "Packages" });
  if (isLaundry) tabs.push({ id: "orders", label: "Orders" });
  return tabs;
}

export default function Dashboard({ session, onSession, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("reports");
  const branchId = session.branchId ?? session.branches[0]?.id ?? null;
  const isSaloon = session.workMode === "saloon";
  const isLaundry = session.workMode === "laundry";
  const TABS = buildTabs(isSaloon, isLaundry);

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
          <ReportsHub token={session.token} branchId={branchId} workMode={session.workMode} />
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
        {tab === "packages" && isSaloon && (
          <PackagesTab token={session.token} branchId={branchId} />
        )}
        {tab === "orders" && isLaundry && (
          <LaundryOrdersTab token={session.token} branchId={branchId} />
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
  session: ManagerSessionType;
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

/* ---------- CSV helpers ---------- */

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = splitLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

function LaundryOrdersTab({ token, branchId }: { token: string; branchId: string }) {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["laundry-orders", branchId, from, to],
    queryFn: () => api.salesAll(token, branchId, { from, to }),
  });

  const rows = q.data ?? [];

  function handleExport() {
    if (rows.length === 0) return alert("No orders to export.");
    downloadCsv(
      "laundry-orders",
      buildCsv(
        rows.map((r) => ({
          Invoice: r.invoiceNumber,
          Date: new Date(r.createdAtClient).toLocaleDateString("en-AE"),
          Customer: String(r.payload.customerName ?? "Walk-in"),
          Items: String((r.payload.items ?? []).length),
          Subtotal: fmtAED(r.payload.subtotal ?? 0),
          VAT: fmtAED(r.payload.vatAmount ?? 0),
          Total: fmtAED(r.payload.total ?? 0),
          Payment: String(r.payload.paymentMethod ?? ""),
          Staff: String(r.payload.staffName ?? ""),
        }))
      )
    );
  }

  const total = rows.reduce((s, r) => s + (r.payload.total ?? 0), 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          onClick={handleExport}
          className="ml-auto px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700"
        >
          Export CSV
        </button>
      </div>

      {q.isLoading && <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}
      {q.isError && <div className="text-sm text-red-600 py-4">Failed to load orders.</div>}

      {!q.isLoading && rows.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-6">
          <div>
            <div className="text-xs text-blue-600 font-semibold mb-1">ORDERS</div>
            <div className="text-2xl font-bold text-blue-900">{rows.length}</div>
          </div>
          <div>
            <div className="text-xs text-blue-600 font-semibold mb-1">TOTAL REVENUE</div>
            <div className="text-2xl font-bold text-blue-900">{fmtAED(total)}</div>
          </div>
        </div>
      )}

      {!q.isLoading && rows.length === 0 && !q.isError && (
        <div className="text-sm text-gray-500 py-8 text-center">No completed orders in this date range.</div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 pr-4 font-semibold text-gray-700">Invoice</th>
                <th className="py-2 pr-4 font-semibold text-gray-700">Date</th>
                <th className="py-2 pr-4 font-semibold text-gray-700">Customer</th>
                <th className="py-2 pr-4 font-semibold text-gray-700 text-right">Items</th>
                <th className="py-2 pr-4 font-semibold text-gray-700 text-right">Total</th>
                <th className="py-2 font-semibold text-gray-700">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clientSaleId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">{r.invoiceNumber}</td>
                  <td className="py-2 pr-4">{new Date(r.createdAtClient).toLocaleDateString("en-AE")}</td>
                  <td className="py-2 pr-4">{r.payload.customerName ?? <span className="text-gray-400">Walk-in</span>}</td>
                  <td className="py-2 pr-4 text-right">{(r.payload.items ?? []).length}</td>
                  <td className="py-2 pr-4 text-right font-semibold">{fmtAED(r.payload.total ?? 0)}</td>
                  <td className="py-2">{r.payload.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductsTab({ token, branchId }: { token: string; branchId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number; updated: number; total: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["products", branchId],
    queryFn: () => api.products(token, branchId),
  });

  const products = q.data?.products ?? [];

  const filtered = useMemo(() => {
    if (!search) return products;
    const ql = search.toLowerCase();
    return products.filter((r) => {
      const p = r.payload;
      return (
        String(p.name ?? "").toLowerCase().includes(ql) ||
        String(p.category ?? "").toLowerCase().includes(ql) ||
        String(p.sku ?? "").toLowerCase().includes(ql) ||
        String(p.barcode ?? "").toLowerCase().includes(ql)
      );
    });
  }, [products, search]);

  function handleExport() {
    if (products.length === 0) return alert("No products to export.");
    downloadCsv(
      "products",
      buildCsv(
        products.map((r) => ({
          Name: String(r.payload.name ?? ""),
          Category: String(r.payload.category ?? ""),
          Price: String(r.payload.price ?? ""),
          SKU: String(r.payload.sku ?? ""),
          Barcode: String(r.payload.barcode ?? ""),
          Description: String(r.payload.description ?? ""),
          StockQuantity: String(r.payload.stockQuantity ?? ""),
          VATInclusive: r.payload.vatInclusive ? "true" : "false",
        })),
      ),
    );
  }

  function downloadTemplate() {
    downloadCsv(
      "products-import-template",
      buildCsv([{
        Name: "Americano",
        Category: "Coffee",
        Price: "15.00",
        SKU: "AMER001",
        Barcode: "",
        Description: "Classic black coffee",
        StockQuantity: "0",
        VATInclusive: "false",
      }]),
    );
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setImportError("CSV is empty or has no data rows.");
        return;
      }
      const missing = ["Name", "Price"].filter((c) => !(c in (parsed[0] ?? {})));
      if (missing.length > 0) {
        setImportError(
          `Missing required columns: ${missing.join(", ")}. Download the template to see the expected format.`,
        );
        return;
      }
      const productRows = parsed
        .map((row) => ({
          name: String(row.Name ?? "").trim(),
          category: String(row.Category ?? "").trim(),
          price: parseFloat(String(row.Price ?? "0")) || 0,
          sku: String(row.SKU ?? "").trim(),
          barcode: String(row.Barcode ?? "").trim(),
          description: String(row.Description ?? "").trim(),
          stockQuantity: parseInt(String(row.StockQuantity ?? "0"), 10) || 0,
          vatInclusive: String(row.VATInclusive ?? "").toLowerCase() === "true",
        }))
        .filter((p) => p.name.length > 0);

      if (productRows.length === 0) {
        setImportError("No valid product rows found (Name column must be non-empty).");
        return;
      }

      const result = await api.importCatalog(token, branchId, productRows);
      setImportResult(result);
      await qc.invalidateQueries({ queryKey: ["products", branchId] });
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-56"
        />
        <span className="text-sm text-gray-400">
          {filtered.length}
          {filtered.length !== products.length ? ` of ${products.length}` : ""} products
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            ↓ Template
          </button>
          <label
            className={
              "text-xs font-semibold border rounded px-2.5 py-1.5 cursor-pointer " +
              (importing
                ? "opacity-50 pointer-events-none text-gray-400 border-gray-200"
                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50")
            }
          >
            {importing ? "Importing…" : "↑ Import CSV"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImport}
              disabled={importing}
            />
          </label>
          <button
            onClick={handleExport}
            className="text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded px-2.5 py-1.5"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Feedback banners */}
      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-4 py-2 text-sm text-emerald-800 flex items-center justify-between">
          <span>
            Import complete — {importResult.created} created, {importResult.updated} updated
            ({importResult.total} rows processed)
          </span>
          <button
            onClick={() => setImportResult(null)}
            className="ml-4 text-emerald-600 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}
      {importError && (
        <div className="bg-rose-50 border border-rose-200 rounded px-4 py-2 text-sm text-rose-800 flex items-center justify-between">
          <span>{importError}</span>
          <button
            onClick={() => setImportError(null)}
            className="ml-4 text-rose-600 hover:text-rose-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded">
        <div className="px-4 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
          Products
        </div>
        {q.isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
        {q.error && (
          <div className="p-4 text-sm text-red-600">
            {(q.error as Error).message}
          </div>
        )}
        {!q.isLoading && !q.error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Barcode</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2 text-center">VAT Incl.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {search
                        ? "No products match your search."
                        : "No products yet. Import a CSV or add products from the POS app."}
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.clientId} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{String(r.payload.name ?? "")}</td>
                    <td className="px-4 py-2 text-gray-600">{String(r.payload.category ?? "") || "—"}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{String(r.payload.sku ?? "") || "—"}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{String(r.payload.barcode ?? "") || "—"}</td>
                    <td className="px-4 py-2 text-right">{fmtAED(String(r.payload.price ?? 0))}</td>
                    <td className="px-4 py-2 text-right">{String(r.payload.stockQuantity ?? 0)}</td>
                    <td className="px-4 py-2 text-center text-emerald-600 font-semibold">
                      {r.payload.vatInclusive ? "✓" : ""}
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

/* ============================================================
   PACKAGES TAB  (saloon mode only)
   ============================================================ */

function PackagesTab({
  token,
  branchId,
}: {
  token: string;
  branchId: string;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiPackage | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["packages", branchId],
    queryFn: () =>
      api
        .packages(token, { branchId, includeInactive: true })
        .then((r) => r.packages),
  });

  const createMut = useMutation({
    mutationFn: (body: ApiPackageInput) => api.createPackage(token, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages", branchId] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ApiPackageInput> }) =>
      api.updatePackage(token, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages", branchId] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deletePackage(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["packages", branchId] }),
  });

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(pkg: ApiPackage) {
    setEditing(pkg);
    setShowForm(true);
  }

  function handleSubmit(values: ApiPackageInput) {
    if (editing) {
      updateMut.mutate({ id: editing.id, body: values });
    } else {
      createMut.mutate({ ...values, branchId });
    }
  }

  const packages = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Prepaid Packages
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define session bundles that customers can purchase and redeem at the
            POS.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-700"
        >
          + New Package
        </button>
      </div>

      {isLoading && (
        <div className="text-sm text-gray-500 py-4">Loading…</div>
      )}
      {error && (
        <div className="text-sm text-red-600 py-4">{(error as Error).message}</div>
      )}
      {!isLoading && !error && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Sessions</th>
                <th className="px-4 py-2 text-right">Price (AED)</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No packages yet. Create one to get started.
                  </td>
                </tr>
              )}
              {packages.map((pkg) => (
                <tr key={pkg.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {pkg.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                    {pkg.description || "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {pkg.totalSessions}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {pkg.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "inline-block px-2 py-0.5 rounded-full text-xs font-medium " +
                        (pkg.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500")
                      }
                    >
                      {pkg.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(pkg)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {pkg.isActive && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Deactivate "${pkg.name}"? Customers with remaining sessions can still redeem them at the POS.`,
                              )
                            ) {
                              deleteMut.mutate(pkg.id);
                            }
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                      {!pkg.isActive && (
                        <button
                          onClick={() =>
                            updateMut.mutate({
                              id: pkg.id,
                              body: { isActive: true },
                            })
                          }
                          className="text-xs text-green-600 hover:underline"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PackageFormModal
          initial={editing}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          saving={createMut.isPending || updateMut.isPending}
          error={createMut.error || updateMut.error}
        />
      )}
    </div>
  );
}

function PackageFormModal({
  initial,
  onSubmit,
  onClose,
  saving,
  error,
}: {
  initial: ApiPackage | null;
  onSubmit: (values: ApiPackageInput) => void;
  onClose: () => void;
  saving: boolean;
  error: Error | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [totalSessions, setTotalSessions] = useState(
    initial?.totalSessions?.toString() ?? "5",
  );
  const [price, setPrice] = useState(initial?.price?.toString() ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessions = parseInt(totalSessions, 10);
    const priceNum = parseFloat(price);
    if (!name.trim()) return;
    if (isNaN(sessions) || sessions < 1) return;
    if (isNaN(priceNum) || priceNum < 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      totalSessions: sessions,
      price: priceNum,
      isActive,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? "Edit Package" : "New Package"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Package Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Hair Treatment Bundle"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sessions *
              </label>
              <input
                type="number"
                value={totalSessions}
                onChange={(e) => setTotalSessions(e.target.value)}
                required
                min={1}
                max={9999}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (AED) *
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                min={0}
                step={0.01}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          {initial && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pkg-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label
                htmlFor="pkg-active"
                className="text-sm text-gray-700"
              >
                Active
              </label>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600">{(error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-gray-900 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : initial ? "Save Changes" : "Create Package"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

