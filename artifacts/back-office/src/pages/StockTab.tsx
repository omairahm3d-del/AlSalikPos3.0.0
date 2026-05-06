import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type AdjustmentInput,
  type StockMovementRow,
  type StockOnHandRow,
} from "@/lib/api";
import { buildCsv, downloadCsv } from "@/lib/csv";

interface Props {
  token: string;
  branchId: string;
}

export default function StockTab({ token, branchId }: Props) {
  const stock = useQuery({
    queryKey: ["stock", branchId],
    queryFn: () => api.stockOnHand(token, branchId),
  });
  const [adjusting, setAdjusting] = useState<StockOnHandRow | null>(null);
  const [showingMovementsFor, setShowingMovementsFor] =
    useState<StockOnHandRow | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = stock.data?.stock ?? [];
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(needle) ||
        (r.sku ?? "").toLowerCase().includes(needle),
    );
  }, [stock.data, search]);

  function exportCsv() {
    const rows = filtered.map((r) => ({
      Product: r.productName,
      SKU: r.sku ?? "",
      "On hand": r.onHand,
    }));
    const csv = buildCsv(rows, ["Product", "SKU", "On hand"]);
    downloadCsv("stock-on-hand", csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">Stock on hand</h2>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or SKU…"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-64"
          />
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded">
        {stock.isLoading && (
          <div className="p-4 text-sm text-gray-500">Loading…</div>
        )}
        {stock.error && (
          <div className="p-4 text-sm text-red-600">
            {(stock.error as Error).message}
          </div>
        )}
        {stock.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2 text-right">On hand</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      {stock.data.stock.length === 0
                        ? "No stock movements yet. Receive stock or push sales to get started."
                        : "No products match your search."}
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const onHand = Number(r.onHand);
                  const low = onHand <= 0;
                  return (
                    <tr key={r.productClientId} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">{r.productName}</td>
                      <td className="px-4 py-2 text-gray-700">{r.sku ?? "—"}</td>
                      <td
                        className={
                          "px-4 py-2 text-right font-medium " +
                          (low ? "text-red-600" : "text-gray-900")
                        }
                      >
                        {onHand.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setShowingMovementsFor(r)}
                          className="text-xs text-gray-600 hover:text-gray-900 underline mr-3"
                        >
                          History
                        </button>
                        <button
                          onClick={() => setAdjusting(r)}
                          className="text-xs text-gray-600 hover:text-gray-900 underline"
                        >
                          Adjust
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

      {adjusting && (
        <AdjustModal
          token={token}
          branchId={branchId}
          row={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
      {showingMovementsFor && (
        <MovementsModal
          token={token}
          branchId={branchId}
          row={showingMovementsFor}
          onClose={() => setShowingMovementsFor(null)}
        />
      )}
    </div>
  );
}

function AdjustModal({
  token,
  branchId,
  row,
  onClose,
}: {
  token: string;
  branchId: string;
  row: StockOnHandRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (body: AdjustmentInput) => api.createAdjustment(token, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock", branchId] });
      qc.invalidateQueries({ queryKey: ["movements", branchId] });
      onClose();
    },
  });
  const onHand = Number(row.onHand);
  const newOnHand = onHand + delta;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-md p-5 space-y-3">
        <div className="text-base font-semibold text-gray-900">
          Adjust stock — {row.productName}
        </div>
        <div className="text-sm text-gray-600">
          Current on hand: <b>{onHand.toLocaleString()}</b>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDelta((d) => Math.abs(d || 1) * -1)}
            className={
              "px-3 py-2 text-sm rounded border " +
              (delta < 0
                ? "bg-red-50 border-red-300 text-red-700"
                : "border-gray-300 text-gray-700")
            }
          >
            Remove (–)
          </button>
          <button
            onClick={() => setDelta((d) => Math.abs(d || 1))}
            className={
              "px-3 py-2 text-sm rounded border " +
              (delta > 0
                ? "bg-green-50 border-green-300 text-green-700"
                : "border-gray-300 text-gray-700")
            }
          >
            Add (+)
          </button>
        </div>

        <label className="block text-sm">
          <div className="text-gray-700 mb-1">Quantity</div>
          <input
            type="number"
            value={Math.abs(delta) || ""}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value) | 0);
              setDelta(delta < 0 ? -n : n || 0);
            }}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block text-sm">
          <div className="text-gray-700 mb-1">Reason</div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. damaged, recount, theft"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>

        <div className="text-sm bg-gray-50 border border-gray-200 rounded p-2">
          New on hand will be:{" "}
          <span
            className={
              "font-semibold " + (newOnHand < 0 ? "text-red-600" : "text-gray-900")
            }
          >
            {newOnHand.toLocaleString()}
          </span>
        </div>

        {m.error && (
          <div className="text-sm text-red-600">{(m.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            disabled={delta === 0 || m.isPending}
            onClick={() =>
              m.mutate({
                branchId,
                productClientId: row.productClientId,
                productName: row.productName,
                sku: row.sku,
                delta,
                reason: reason || null,
              })
            }
            className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {m.isPending ? "Saving…" : "Record adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementsModal({
  token,
  branchId,
  row,
  onClose,
}: {
  token: string;
  branchId: string;
  row: StockOnHandRow;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["movements", branchId, row.productClientId],
    queryFn: () =>
      api.stockMovements(token, branchId, {
        productClientId: row.productClientId,
        limit: 200,
      }),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl my-8">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="font-semibold text-gray-900">
            Stock history — {row.productName}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-sm"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {q.isLoading && (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          )}
          {q.error && (
            <div className="p-4 text-sm text-red-600">
              {(q.error as Error).message}
            </div>
          )}
          {q.data && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Δ</th>
                  <th className="px-4 py-2">Reason / ref</th>
                </tr>
              </thead>
              <tbody>
                {q.data.movements.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No movements recorded.
                    </td>
                  </tr>
                )}
                {q.data.movements.map((m) => (
                  <MovementRow key={m.id} m={m} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MovementRow({ m }: { m: StockMovementRow }) {
  const delta = Number(m.delta);
  const positive = delta > 0;
  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-2 text-gray-700">
        {new Date(m.createdAt).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="px-4 py-2 capitalize">{m.kind}</td>
      <td
        className={
          "px-4 py-2 text-right font-medium " +
          (positive ? "text-green-700" : "text-red-700")
        }
      >
        {positive ? "+" : ""}
        {delta.toLocaleString()}
      </td>
      <td className="px-4 py-2 text-gray-700">
        {m.reason ?? <span className="text-gray-400 text-xs">{m.refId}</span>}
      </td>
    </tr>
  );
}
