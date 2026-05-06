import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Purchase, type Supplier, type SupplierInput } from "@/lib/api";

interface Props {
  token: string;
  branchId: string;
}

const EMPTY: SupplierInput = {
  name: "",
  phone: "",
  email: "",
  address: "",
  paymentTerms: "",
  notes: "",
};

export default function SuppliersTab({ token, branchId }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["suppliers", branchId],
    queryFn: () => api.suppliers(token, branchId),
  });
  const activityQ = useQuery({
    queryKey: ["suppliers-activity", branchId],
    queryFn: () => api.suppliersActivity(token, branchId, { windowDays: 30 }),
  });
  const activityById = useMemo(() => {
    const map = new Map<
      string,
      { lastReceivedAt: string | null; windowTotal: string; windowCount: number }
    >();
    for (const a of activityQ.data?.activity ?? []) {
      map.set(a.supplierId, {
        lastReceivedAt: a.lastReceivedAt,
        windowTotal: a.windowTotal,
        windowCount: a.windowCount,
      });
    }
    return map;
  }, [activityQ.data]);

  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [statementFor, setStatementFor] = useState<Supplier | null>(null);

  const create = useMutation({
    mutationFn: (body: SupplierInput) =>
      api.createSupplier(token, { ...body, branchId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers", branchId] });
      setEditing(null);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SupplierInput> }) =>
      api.updateSupplier(token, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers", branchId] });
      setEditing(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Suppliers</h2>
        <button
          onClick={() => setEditing("new")}
          className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
        >
          + New supplier
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded">
        {q.isLoading && (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        )}
        {q.error && (
          <div className="p-4 text-sm text-red-600">
            {(q.error as Error).message}
          </div>
        )}
        {q.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Last receipt</th>
                  <th className="px-4 py-2 text-right">30d total</th>
                  <th className="px-4 py-2">Payment terms</th>
                  <th className="px-4 py-2">Scope</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {q.data.suppliers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No suppliers yet. Add your first one.
                    </td>
                  </tr>
                )}
                {q.data.suppliers.map((s) => {
                  const act = activityById.get(s.id);
                  return (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-gray-700">{s.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      {act?.lastReceivedAt
                        ? new Date(act.lastReceivedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                      {act && act.windowCount > 0 ? (
                        <>
                          <span className="text-gray-900">AED {act.windowTotal}</span>
                          <span className="text-xs text-gray-500 ml-1">
                            ({act.windowCount})
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{s.paymentTerms ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {s.branchId ? "Branch" : "Company-wide"}
                    </td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => setStatementFor(s)}
                        className="text-sm text-gray-700 hover:text-gray-900 underline"
                      >
                        Statement
                      </button>
                      <button
                        onClick={() => setEditing(s)}
                        className="text-sm text-gray-700 hover:text-gray-900 underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statementFor && (
        <SupplierStatementModal
          token={token}
          branchId={branchId}
          supplier={statementFor}
          onClose={() => setStatementFor(null)}
        />
      )}

      {editing && (
        <SupplierModal
          initial={editing === "new" ? EMPTY : toInput(editing)}
          title={editing === "new" ? "New supplier" : `Edit ${editing.name}`}
          submitting={create.isPending || update.isPending}
          error={
            (create.error as Error | null)?.message ??
            (update.error as Error | null)?.message ??
            null
          }
          onCancel={() => setEditing(null)}
          onSubmit={(body) =>
            editing === "new"
              ? create.mutate(body)
              : update.mutate({ id: editing.id, body })
          }
        />
      )}
    </div>
  );
}

function toInput(s: Supplier): SupplierInput {
  return {
    name: s.name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    paymentTerms: s.paymentTerms,
    notes: s.notes,
    isActive: s.isActive,
    branchId: s.branchId,
  };
}

function SupplierModal({
  initial,
  title,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  initial: SupplierInput;
  title: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: SupplierInput) => void;
}) {
  const [form, setForm] = useState<SupplierInput>(initial);
  function set<K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-md p-5 space-y-3">
        <div className="text-base font-semibold text-gray-900">{title}</div>
        <Field label="Name" required>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Email">
            <input
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </Field>
        </div>
        <Field label="Address">
          <input
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Payment terms">
          <input
            value={form.paymentTerms ?? ""}
            onChange={(e) => set("paymentTerms", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            placeholder="e.g. Net 30"
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            rows={2}
          />
        </Field>
        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !form.name.trim()}
            onClick={() => onSubmit(form)}
            className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplierStatementModal({
  token,
  branchId,
  supplier,
  onClose,
}: {
  token: string;
  branchId: string;
  supplier: Supplier;
  onClose: () => void;
}) {
  // Default range: last 90 days. Date inputs are local YYYY-MM-DD; we widen
  // to the day's UTC bounds when querying so a single calendar day is
  // inclusive on both ends.
  const today = new Date();
  const ninety = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(toIsoDate(ninety));
  const [to, setTo] = useState(toIsoDate(today));
  const [scope, setScope] = useState<"branch" | "company">(
    supplier.branchId ? "branch" : "company",
  );
  const branchScopeAllowed = !supplier.branchId; // company-wide suppliers can flip

  const queryBranchId =
    scope === "branch" || supplier.branchId ? branchId : undefined;

  const q = useQuery({
    queryKey: [
      "supplier-statement",
      supplier.id,
      queryBranchId ?? "all",
      from,
      to,
    ],
    queryFn: () =>
      api.supplierStatement(token, supplier.id, {
        branchId: queryBranchId,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      }),
  });

  const csvHref = useMemo(() => {
    if (!q.data) return null;
    const rows: string[][] = [
      ["Received", "Reference", "Supplier", "Subtotal", "VAT", "Total", "Notes"],
      ...q.data.purchases.map((p: Purchase) => [
        new Date(p.receivedAt).toISOString(),
        p.referenceNumber ?? "",
        p.supplierName,
        p.subtotal,
        p.vatAmount,
        p.total,
        (p.notes ?? "").replace(/\s+/g, " "),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    return URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
  }, [q.data]);

  const csvName = `supplier-statement-${supplier.name.replace(/[^a-z0-9]+/gi, "_")}-${from}_to_${to}.csv`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-gray-900">
              Statement — {supplier.name}
            </div>
            <div className="text-xs text-gray-500">
              {supplier.branchId ? "Branch-private supplier" : "Company-wide supplier"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
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
          {branchScopeAllowed && (
            <label className="text-sm">
              <div className="text-gray-700 mb-1">Scope</div>
              <select
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value === "branch" ? "branch" : "company")
                }
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="company">All branches</option>
                <option value="branch">Current branch only</option>
              </select>
            </label>
          )}
          {csvHref && (
            <a
              href={csvHref}
              download={csvName}
              className="ml-auto px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
            >
              Export CSV
            </a>
          )}
        </div>

        {q.isLoading && (
          <div className="text-sm text-gray-500">Loading…</div>
        )}
        {q.error && (
          <div className="text-sm text-red-600">
            {(q.error as Error).message}
          </div>
        )}
        {q.data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Receipts" value={String(q.data.totals.count)} />
              <Stat label="Subtotal" value={`AED ${q.data.totals.subtotal}`} />
              <Stat label="VAT" value={`AED ${q.data.totals.vatAmount}`} />
              <Stat label="Total" value={`AED ${q.data.totals.total}`} />
            </div>
            {q.data.totals.missingReferenceCount > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {q.data.totals.missingReferenceCount} receipt
                {q.data.totals.missingReferenceCount === 1 ? "" : "s"} in this
                range have no supplier reference number.
              </div>
            )}

            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2 text-right">VAT</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.purchases.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-gray-500"
                      >
                        No receipts in this range.
                      </td>
                    </tr>
                  )}
                  {q.data.purchases.map((p: Purchase) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">
                        {new Date(p.receivedAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {p.referenceNumber ?? (
                          <span className="text-amber-700">— missing —</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.subtotal}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.vatAmount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {p.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}
