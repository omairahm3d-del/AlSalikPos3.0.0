import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CatalogRow,
  type PurchaseInput,
  type PurchaseLineInput,
  type Supplier,
} from "@/lib/api";
import { fmtAED } from "@/lib/csv";

interface Props {
  token: string;
  branchId: string;
}

export default function PurchasesTab({ token, branchId }: Props) {
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["purchases", branchId],
    queryFn: () => api.purchases(token, branchId, { limit: 200 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Purchases (Goods Received)
        </h2>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
        >
          + Receive stock
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded">
        {list.isLoading && (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        )}
        {list.error && (
          <div className="p-4 text-sm text-red-600">
            {(list.error as Error).message}
          </div>
        )}
        {list.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Received</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2 text-right">Subtotal</th>
                  <th className="px-4 py-2 text-right">VAT</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {list.data.purchases.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No purchases yet. Click <b>Receive stock</b> to add one.
                    </td>
                  </tr>
                )}
                {list.data.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(p.receivedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2 font-medium">{p.supplierName}</td>
                    <td className="px-4 py-2 text-gray-700">{p.referenceNumber ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{fmtAED(p.subtotal)}</td>
                    <td className="px-4 py-2 text-right">{fmtAED(p.vatAmount)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtAED(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <ReceiveStockModal
          token={token}
          branchId={branchId}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Receive Stock modal                                                    */
/* ---------------------------------------------------------------------- */

interface DraftLine {
  key: string;
  productClientId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  vatAmount: number;
}

function ReceiveStockModal({
  token,
  branchId,
  onClose,
}: {
  token: string;
  branchId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const suppliers = useQuery({
    queryKey: ["suppliers", branchId],
    queryFn: () => api.suppliers(token, branchId),
  });
  const products = useQuery({
    queryKey: ["products", branchId],
    queryFn: () => api.products(token, branchId),
  });

  const [supplierMode, setSupplierMode] = useState<"existing" | "free-text">(
    "existing",
  );
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  // Stable per-form-open key so a double-click / network retry does NOT
  // create two GRNs (the server returns the first one's row).
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `boff-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const l of lines) {
      subtotal += l.unitCost * l.quantity;
      vat += l.vatAmount;
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

  const create = useMutation({
    mutationFn: (body: PurchaseInput) => api.createPurchase(token, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases", branchId] });
      qc.invalidateQueries({ queryKey: ["stock", branchId] });
      onClose();
    },
  });

  function addLineFromProduct(p: CatalogRow) {
    const payload = p.payload as Record<string, unknown>;
    const name =
      typeof payload.name === "string" ? payload.name : "(unnamed product)";
    const sku = typeof payload.sku === "string" ? payload.sku : null;
    setLines((ls) => [
      ...ls,
      {
        key: `${p.clientId}-${Date.now()}-${Math.random()}`,
        productClientId: p.clientId,
        productName: name,
        sku,
        quantity: 1,
        unitCost: 0,
        vatAmount: 0,
      },
    ]);
  }

  function addCustomLine() {
    setLines((ls) => [
      ...ls,
      {
        key: `custom-${Date.now()}-${Math.random()}`,
        productClientId: `custom-${Date.now()}`,
        productName: "",
        sku: null,
        quantity: 1,
        unitCost: 0,
        vatAmount: 0,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const resolvedSupplier: Supplier | undefined = useMemo(
    () => suppliers.data?.suppliers.find((s) => s.id === supplierId),
    [suppliers.data, supplierId],
  );
  const finalSupplierName =
    supplierMode === "existing"
      ? (resolvedSupplier?.name ?? "")
      : supplierName.trim();
  const canSubmit =
    finalSupplierName.length > 0 &&
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.productName.trim().length > 0 &&
        l.quantity > 0 &&
        l.unitCost >= 0 &&
        l.vatAmount >= 0,
    );

  function submit() {
    const body: PurchaseInput = {
      branchId,
      idempotencyKey,
      supplierId: supplierMode === "existing" ? supplierId || null : null,
      supplierName: finalSupplierName,
      referenceNumber: reference || null,
      notes: notes || null,
      items: lines.map<PurchaseLineInput>((l) => ({
        productClientId: l.productClientId,
        productName: l.productName.trim(),
        sku: l.sku,
        quantity: l.quantity,
        unitCost: l.unitCost,
        vatAmount: l.vatAmount,
      })),
    };
    create.mutate(body);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded shadow-lg w-full max-w-3xl my-8">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="font-semibold text-gray-900">
            Receive stock (Goods Received)
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Supplier */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Supplier</div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={supplierMode === "existing"}
                  onChange={() => setSupplierMode("existing")}
                />
                From directory
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={supplierMode === "free-text"}
                  onChange={() => setSupplierMode("free-text")}
                />
                One-off (type a name)
              </label>
            </div>
            {supplierMode === "existing" ? (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="">— Select supplier —</option>
                {suppliers.data?.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Supplier name"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <div className="text-gray-700 mb-1">Reference / Invoice #</div>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder="e.g. INV-2025-001"
              />
            </label>
            <label className="block text-sm">
              <div className="text-gray-700 mb-1">Notes</div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">Items</div>
              <div className="flex gap-2">
                <ProductPicker
                  options={products.data?.products ?? []}
                  onPick={addLineFromProduct}
                />
                <button
                  onClick={addCustomLine}
                  className="text-sm text-gray-700 hover:text-gray-900 underline"
                >
                  + Custom item
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 w-20 text-right">Qty</th>
                    <th className="px-3 py-2 w-28 text-right">Unit cost</th>
                    <th className="px-3 py-2 w-28 text-right">VAT</th>
                    <th className="px-3 py-2 w-28 text-right">Line total</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                        No items yet. Pick a product or add a custom item.
                      </td>
                    </tr>
                  )}
                  {lines.map((l) => (
                    <tr key={l.key} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          value={l.productName}
                          onChange={(e) =>
                            updateLine(l.key, { productName: e.target.value })
                          }
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                          placeholder="Product name"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.key, {
                              quantity: Math.max(0, Number(e.target.value) | 0),
                            })
                          }
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.unitCost}
                          onChange={(e) =>
                            updateLine(l.key, {
                              unitCost: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.vatAmount}
                          onChange={(e) =>
                            updateLine(l.key, {
                              vatAmount: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {fmtAED(l.unitCost * l.quantity + l.vatAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeLine(l.key)}
                          className="text-gray-400 hover:text-red-600"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lines.length > 0 && (
              <div className="flex justify-end gap-6 text-sm pr-2">
                <div className="text-gray-700">
                  Subtotal: <span className="font-medium">{fmtAED(totals.subtotal)}</span>
                </div>
                <div className="text-gray-700">
                  VAT: <span className="font-medium">{fmtAED(totals.vat)}</span>
                </div>
                <div className="text-gray-900">
                  Total: <span className="font-semibold">{fmtAED(totals.total)}</span>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500">
              Quick VAT helper: 5% UAE VAT ≈ multiply each line's
              <i> qty × unit cost </i> by 0.05.
              <button
                onClick={() =>
                  setLines((ls) =>
                    ls.map((l) => ({
                      ...l,
                      vatAmount: Math.round(l.unitCost * l.quantity * 0.05 * 100) / 100,
                    })),
                  )
                }
                className="ml-2 underline"
              >
                Apply 5% VAT to all lines
              </button>
            </div>
          </div>

          {create.error && (
            <div className="text-sm text-red-600">
              {(create.error as Error).message}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit || create.isPending}
            onClick={submit}
            className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Save & receive stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductPicker({
  options,
  onPick,
}: {
  options: CatalogRow[];
  onPick: (p: CatalogRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options.slice(0, 50);
    return options
      .filter((p) => {
        const payload = p.payload as Record<string, unknown>;
        const name =
          typeof payload.name === "string" ? payload.name.toLowerCase() : "";
        const sku =
          typeof payload.sku === "string" ? payload.sku.toLowerCase() : "";
        return name.includes(needle) || sku.includes(needle);
      })
      .slice(0, 50);
  }, [options, q]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm text-gray-700 hover:text-gray-900 underline"
      >
        + Pick product
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white border border-gray-200 rounded shadow z-10">
          <div className="p-2 border-b border-gray-200">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products…"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-3 text-sm text-gray-500 text-center">No matches.</div>
            )}
            {filtered.map((p) => {
              const payload = p.payload as Record<string, unknown>;
              const name =
                typeof payload.name === "string" ? payload.name : p.clientId;
              const sku =
                typeof payload.sku === "string" ? payload.sku : null;
              return (
                <button
                  key={p.clientId}
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                    setQ("");
                  }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50"
                >
                  <div className="font-medium text-gray-900">{name}</div>
                  {sku && <div className="text-xs text-gray-500">SKU: {sku}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
