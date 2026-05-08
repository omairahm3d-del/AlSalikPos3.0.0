import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ManagerSession } from "@/lib/session";
import ReportsHub from "./ReportsHub";
import SuppliersTab from "./SuppliersTab";
import PurchasesTab from "./PurchasesTab";
import StockTab from "./StockTab";
import { fmtAED, buildCsv, downloadCsv } from "@/lib/csv";

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

