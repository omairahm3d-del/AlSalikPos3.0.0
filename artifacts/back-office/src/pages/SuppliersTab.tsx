import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Supplier, type SupplierInput } from "@/lib/api";

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

  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

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
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Payment terms</th>
                  <th className="px-4 py-2">Scope</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {q.data.suppliers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No suppliers yet. Add your first one.
                    </td>
                  </tr>
                )}
                {q.data.suppliers.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-gray-700">{s.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{s.email ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{s.paymentTerms ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {s.branchId ? "Branch" : "Company-wide"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-sm text-gray-700 hover:text-gray-900 underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
