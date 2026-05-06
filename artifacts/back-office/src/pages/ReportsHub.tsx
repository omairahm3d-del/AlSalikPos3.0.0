import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SaleRow, type SalePayload } from "@/lib/api";
import { buildCsv, downloadCsv, fmtAED } from "@/lib/csv";

/* ------------------------------------------------------------------------ */
/* Date presets — match POS ReportsHub                                      */
/* ------------------------------------------------------------------------ */

type Preset = "today" | "yesterday" | "last7" | "last30" | "thismonth";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 Days" },
  { key: "last30", label: "30 Days" },
  { key: "thismonth", label: "This Month" },
];

function presetRange(p: Preset): { from: string; to: string; label: string } {
  const now = new Date();
  const sot = new Date(now); sot.setHours(0, 0, 0, 0);
  const eot = new Date(now); eot.setHours(23, 59, 59, 999);
  switch (p) {
    case "today":
      return { from: sot.toISOString(), to: eot.toISOString(), label: "Today" };
    case "yesterday": {
      const s = new Date(sot); s.setDate(s.getDate() - 1);
      const e = new Date(s); e.setHours(23, 59, 59, 999);
      return { from: s.toISOString(), to: e.toISOString(), label: "Yesterday" };
    }
    case "last7": {
      const s = new Date(sot); s.setDate(s.getDate() - 6);
      return { from: s.toISOString(), to: eot.toISOString(), label: "Last 7 Days" };
    }
    case "last30": {
      const s = new Date(sot); s.setDate(s.getDate() - 29);
      return { from: s.toISOString(), to: eot.toISOString(), label: "Last 30 Days" };
    }
    case "thismonth": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: s.toISOString(), to: eot.toISOString(), label: "This Month" };
    }
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit",
  });
}
function n(v: string | number | undefined): number {
  if (v == null) return 0;
  const x = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(x) ? x : 0;
}

/* ------------------------------------------------------------------------ */
/* Hub                                                                      */
/* ------------------------------------------------------------------------ */

type View =
  | null
  | "daily"
  | "payment"
  | "staff"
  | "rider"
  | "customer"
  | "items";

const HUB_ITEMS: {
  key: Exclude<View, null>;
  title: string;
  sub: string;
  color: string;
}[] = [
  { key: "daily", title: "Daily Sales (Z-style)", sub: "End-of-day roll-up: net sales, VAT, transactions per day", color: "#E74C3C" },
  { key: "payment", title: "Payment Method Report", sub: "Revenue breakdown by cash, card & credit", color: "#4F8EF7" },
  { key: "staff", title: "Staff Sales Report", sub: "Performance per staff member", color: "#2ECC71" },
  { key: "rider", title: "Rider Delivery Report", sub: "Deliveries and revenue per rider", color: "#3498DB" },
  { key: "customer", title: "Customer Transactions", sub: "Transaction history per customer", color: "#9B59B6" },
  { key: "items", title: "Daily Item Detail", sub: "Full transaction & line-item breakdown", color: "#F39C12" },
];

export default function ReportsHub({
  token,
  branchId,
}: {
  token: string;
  branchId: string;
}) {
  const [view, setView] = useState<View>(null);

  if (view === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {HUB_ITEMS.map((it) => (
          <button
            key={it.key}
            onClick={() => setView(it.key)}
            className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition flex items-start gap-3"
          >
            <span
              className="inline-flex w-10 h-10 rounded-md items-center justify-center shrink-0 text-white text-base font-bold"
              style={{ backgroundColor: it.color }}
              aria-hidden
            >
              {it.title.charAt(0)}
            </span>
            <span className="flex-1">
              <div className="font-semibold text-gray-900">{it.title}</div>
              <div className="text-xs text-gray-500 mt-1">{it.sub}</div>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const back = () => setView(null);
  const common = { token, branchId, onBack: back };
  switch (view) {
    case "daily": return <DailyReport {...common} />;
    case "payment": return <PaymentReport {...common} />;
    case "staff": return <StaffReport {...common} />;
    case "rider": return <RiderReport {...common} />;
    case "customer": return <CustomerReport {...common} />;
    case "items": return <ItemsReport {...common} />;
  }
}

/* ------------------------------------------------------------------------ */
/* Shared building blocks                                                   */
/* ------------------------------------------------------------------------ */

function ReportFrame({
  title,
  onBack,
  onExport,
  controls,
  children,
}: {
  title: string;
  onBack: () => void;
  onExport?: () => void;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span> Reports
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {onExport ? (
          <button
            onClick={onExport}
            className="ml-auto text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded px-2.5 py-1.5"
          >
            ↓ CSV
          </button>
        ) : null}
      </div>
      {controls}
      {children}
    </div>
  );
}

function PresetBar({
  preset,
  onChange,
}: {
  preset: Preset;
  onChange: (p: Preset) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={
            "px-3 py-1.5 text-xs font-semibold rounded border " +
            (preset === p.key
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50")
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function StatGrid({
  stats,
}: {
  stats: { label: string; value: string; accent?: "good" | "bad" | "warn" }[];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white border border-gray-200 rounded px-4 py-3"
        >
          <div className="text-[11px] uppercase tracking-wide text-gray-500">
            {s.label}
          </div>
          <div
            className={
              "text-xl font-semibold mt-1 " +
              (s.accent === "good"
                ? "text-emerald-600"
                : s.accent === "bad"
                  ? "text-rose-600"
                  : s.accent === "warn"
                    ? "text-amber-600"
                    : "text-gray-900")
            }
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded overflow-hidden mt-2">
      <div
        className="h-full bg-gray-900"
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded p-12 text-center text-gray-500 text-sm">
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* useRangeSales — fetch sales for the active date preset                   */
/* ------------------------------------------------------------------------ */

function useRangeSales(token: string, branchId: string, preset: Preset) {
  const range = useMemo(() => presetRange(preset), [preset]);
  const q = useQuery({
    queryKey: ["range-sales", branchId, preset],
    queryFn: async () => {
      const sales = await api.salesAll(token, branchId, {
        from: range.from,
        to: range.to,
      });
      return { sales };
    },
  });
  return { range, q };
}

/* ------------------------------------------------------------------------ */
/* 1. Daily Sales (Z-style roll-up from cloud)                              */
/* ------------------------------------------------------------------------ */

function DailyReport({
  token,
  branchId,
  onBack,
}: {
  token: string;
  branchId: string;
  onBack: () => void;
}) {
  const [preset, setPreset] = useState<Preset>("last7");
  const { range, q } = useRangeSales(token, branchId, preset);

  const days = useMemo(() => {
    const sales = q.data?.sales ?? [];
    const map = new Map<
      string,
      {
        date: string;
        sales: number;
        refunds: number;
        net: number;
        vat: number;
        txns: number;
        cash: number;
      }
    >();
    for (const s of sales) {
      const d = new Date(s.createdAtClient);
      const key = d.toISOString().slice(0, 10);
      let row = map.get(key);
      if (!row) {
        row = { date: key, sales: 0, refunds: 0, net: 0, vat: 0, txns: 0, cash: 0 };
        map.set(key, row);
      }
      const total = n(s.total);
      const vat = n(s.vatAmount);
      if (s.isRefund) {
        row.refunds += Math.abs(total);
        row.net -= Math.abs(total);
      } else {
        row.sales += total;
        row.net += total;
        row.vat += vat;
        row.txns += 1;
        if (s.paymentMethod?.toLowerCase() === "cash") row.cash += total;
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [q.data]);

  const totals = useMemo(
    () => days.reduce(
      (acc, d) => {
        acc.sales += d.sales; acc.refunds += d.refunds; acc.net += d.net;
        acc.vat += d.vat; acc.txns += d.txns; acc.cash += d.cash;
        return acc;
      },
      { sales: 0, refunds: 0, net: 0, vat: 0, txns: 0, cash: 0 },
    ),
    [days],
  );

  const handleExport = () => {
    if (days.length === 0) return alert("Nothing to export.");
    const csv = buildCsv(
      days.map((d) => ({
        Date: d.date,
        Transactions: d.txns,
        TotalSales: d.sales.toFixed(2),
        Refunds: d.refunds.toFixed(2),
        NetSales: d.net.toFixed(2),
        VAT: d.vat.toFixed(2),
        Cash: d.cash.toFixed(2),
      })),
    );
    downloadCsv("daily-sales", csv);
  };

  return (
    <ReportFrame
      title="Daily Sales (Z-style)"
      onBack={onBack}
      onExport={handleExport}
      controls={<PresetBar preset={preset} onChange={setPreset} />}
    >
      <StatGrid
        stats={[
          { label: "Period", value: range.label },
          { label: "Total Revenue", value: fmtAED(totals.sales), accent: "good" },
          { label: "VAT Collected", value: fmtAED(totals.vat) },
          { label: "Transactions", value: String(totals.txns) },
        ]}
      />
      {q.isLoading ? (
        <EmptyState label="Loading…" />
      ) : days.length === 0 ? (
        <EmptyState label={`No sales in ${range.label}`} />
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Txns</th>
                <th className="px-4 py-2 text-right">Sales</th>
                <th className="px-4 py-2 text-right">Refunds</th>
                <th className="px-4 py-2 text-right">VAT</th>
                <th className="px-4 py-2 text-right">Net</th>
                <th className="px-4 py-2 text-right">Cash</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{fmtDate(d.date)}</td>
                  <td className="px-4 py-2 text-right">{d.txns}</td>
                  <td className="px-4 py-2 text-right">{fmtAED(d.sales)}</td>
                  <td className="px-4 py-2 text-right text-rose-600">
                    {d.refunds > 0 ? `-${fmtAED(d.refunds)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtAED(d.vat)}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {fmtAED(d.net)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {fmtAED(d.cash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Payment method                                                        */
/* ------------------------------------------------------------------------ */

function validSalesOf(rows: SaleRow[]): SaleRow[] {
  return rows.filter((s) => !s.isRefund);
}

function PaymentReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("last7");
  const { range, q } = useRangeSales(token, branchId, preset);
  const sales = q.data?.sales ?? [];
  const valid = validSalesOf(sales);
  const refundTotal = sales.filter((s) => s.isRefund)
    .reduce((sum, s) => sum + Math.abs(n(s.total)), 0);

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const s of valid) {
      const ex = map.get(s.paymentMethod);
      const amt = n(s.total);
      if (ex) { ex.count++; ex.amount += amt; }
      else map.set(s.paymentMethod, { count: 1, amount: amt });
    }
    const total = valid.reduce((sum, s) => sum + n(s.total), 0);
    return Array.from(map.entries())
      .map(([method, v]) => ({ method, ...v, pct: total > 0 ? (v.amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const total = valid.reduce((sum, s) => sum + n(s.total), 0);

  const handleExport = () => {
    if (stats.length === 0) return alert("Nothing to export.");
    downloadCsv(
      "payment-methods",
      buildCsv(stats.map((p) => ({
        Method: p.method,
        Transactions: p.count,
        Amount: p.amount.toFixed(2),
        Percentage: p.pct.toFixed(2) + "%",
      }))),
    );
  };

  return (
    <ReportFrame
      title="Payment Method Report"
      onBack={onBack}
      onExport={handleExport}
      controls={<PresetBar preset={preset} onChange={setPreset} />}
    >
      <StatGrid
        stats={[
          { label: "Period", value: range.label },
          { label: "Total Revenue", value: fmtAED(total), accent: "good" },
          { label: "Refunds", value: refundTotal > 0 ? `-${fmtAED(refundTotal)}` : "—", accent: refundTotal > 0 ? "bad" : undefined },
          { label: "Avg. Order", value: fmtAED(valid.length > 0 ? total / valid.length : 0) },
        ]}
      />
      {q.isLoading ? <EmptyState label="Loading…" /> :
        stats.length === 0 ? <EmptyState label={`No sales in ${range.label}`} /> : (
        <div className="space-y-2">
          {stats.map((p) => (
            <div key={p.method} className="bg-white border border-gray-200 rounded p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold capitalize">{p.method}</div>
                  <div className="text-xs text-gray-500">
                    {p.count} transaction{p.count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtAED(p.amount)}</div>
                  <div className="text-xs text-blue-600 font-medium">
                    {p.pct.toFixed(1)}%
                  </div>
                </div>
              </div>
              <ProgressBar pct={p.pct} />
            </div>
          ))}
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Staff                                                                 */
/* ------------------------------------------------------------------------ */

function StaffReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("last7");
  const { range, q } = useRangeSales(token, branchId, preset);
  const valid = validSalesOf(q.data?.sales ?? []);

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const s of valid) {
      const name = s.payload?.staffName || "Unknown";
      const ex = map.get(name);
      const amt = n(s.total);
      if (ex) { ex.count++; ex.amount += amt; }
      else map.set(name, { count: 1, amount: amt });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const total = stats.reduce((sum, s) => sum + s.amount, 0);

  const handleExport = () => {
    if (stats.length === 0) return alert("Nothing to export.");
    downloadCsv("staff-sales", buildCsv(stats.map((s) => ({
      Staff: s.name, Sales: s.count,
      TotalRevenue: s.amount.toFixed(2), AvgOrder: s.avg.toFixed(2),
    }))));
  };

  return (
    <ReportFrame
      title="Staff Sales Report"
      onBack={onBack}
      onExport={handleExport}
      controls={<PresetBar preset={preset} onChange={setPreset} />}
    >
      <StatGrid
        stats={[
          { label: "Period", value: range.label },
          { label: "Total Revenue", value: fmtAED(total), accent: "good" },
          { label: "Active Staff", value: String(stats.length) },
          { label: "Transactions", value: String(valid.length) },
        ]}
      />
      {q.isLoading ? <EmptyState label="Loading…" /> :
        stats.length === 0 ? <EmptyState label={`No staff data in ${range.label}`} /> : (
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={s.name} className="bg-white border border-gray-200 rounded p-4">
              <div className="flex items-center gap-3">
                <span
                  className={
                    "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold " +
                    (i === 0 ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600")
                  }
                >
                  #{i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.count} sales · Avg {fmtAED(s.avg)}
                  </div>
                </div>
                <div className="font-semibold">{fmtAED(s.amount)}</div>
              </div>
              <ProgressBar pct={total > 0 ? (s.amount / total) * 100 : 0} />
            </div>
          ))}
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Rider                                                                 */
/* ------------------------------------------------------------------------ */

function RiderReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("last7");
  const { range, q } = useRangeSales(token, branchId, preset);
  const valid = validSalesOf(q.data?.sales ?? []);

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const s of valid.filter((x) => x.payload?.orderType === "delivery" && (x.payload?.riderId || x.payload?.riderName))) {
      const name = s.payload?.riderName || s.payload?.riderId || "Unknown";
      const ex = map.get(name);
      const amt = n(s.total);
      if (ex) { ex.count++; ex.amount += amt; }
      else map.set(name, { count: 1, amount: amt });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const totalRevenue = stats.reduce((s, x) => s + x.amount, 0);
  const totalDeliveries = stats.reduce((s, x) => s + x.count, 0);

  const handleExport = () => {
    if (stats.length === 0) return alert("Nothing to export.");
    downloadCsv("rider-deliveries", buildCsv(stats.map((r) => ({
      Rider: r.name, Deliveries: r.count,
      TotalRevenue: r.amount.toFixed(2), AvgPerDelivery: r.avg.toFixed(2),
    }))));
  };

  return (
    <ReportFrame
      title="Rider Delivery Report"
      onBack={onBack}
      onExport={handleExport}
      controls={<PresetBar preset={preset} onChange={setPreset} />}
    >
      <StatGrid
        stats={[
          { label: "Period", value: range.label },
          { label: "Total Deliveries", value: String(totalDeliveries) },
          { label: "Total Revenue", value: fmtAED(totalRevenue), accent: "good" },
          { label: "Active Riders", value: String(stats.length) },
        ]}
      />
      {q.isLoading ? <EmptyState label="Loading…" /> :
        stats.length === 0 ? <EmptyState label={`No delivery data in ${range.label}`} /> : (
        <div className="space-y-2">
          {stats.map((r, i) => (
            <div key={r.name} className="bg-white border border-gray-200 rounded p-4">
              <div className="flex items-center gap-3">
                <span
                  className={
                    "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold " +
                    (i === 0 ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600")
                  }
                >
                  🛵
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    {r.count} deliveries · Avg {fmtAED(r.avg)}
                  </div>
                </div>
                <div className="font-semibold">{fmtAED(r.amount)}</div>
              </div>
              <ProgressBar pct={totalRevenue > 0 ? (r.amount / totalRevenue) * 100 : 0} />
            </div>
          ))}
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 5. Customer transactions                                                 */
/* ------------------------------------------------------------------------ */

function CustomerReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("last7");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { range, q } = useRangeSales(token, branchId, preset);
  const valid = validSalesOf(q.data?.sales ?? []);

  const customers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const s of valid) {
      const id = s.customerId || s.payload?.customerId || "";
      if (!id) continue;
      const name = s.payload?.customerName || "(unnamed)";
      const ex = map.get(id);
      const amt = n(s.total);
      if (ex) { ex.count++; ex.total += amt; }
      else map.set(id, { name, count: 1, total: amt });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [valid]);

  const filtered = useMemo(() => {
    const ql = search.toLowerCase();
    return customers.filter((c) => !ql || c.name.toLowerCase().includes(ql));
  }, [customers, search]);

  const txns = useMemo(() => {
    if (!selected) return [];
    return valid
      .filter((s) => (s.customerId || s.payload?.customerId) === selected)
      .sort((a, b) => (a.createdAtClient < b.createdAtClient ? 1 : -1));
  }, [valid, selected]);

  const handleExport = () => {
    if (selected) {
      if (txns.length === 0) return alert("Nothing to export.");
      downloadCsv("customer-transactions", buildCsv(txns.map((s) => ({
        Invoice: s.invoiceNumber,
        Date: s.createdAtClient,
        Method: s.paymentMethod,
        VAT: n(s.vatAmount).toFixed(2),
        Total: n(s.total).toFixed(2),
      }))));
    } else {
      if (filtered.length === 0) return alert("Nothing to export.");
      downloadCsv("customers-summary", buildCsv(filtered.map((c) => ({
        Name: c.name, Transactions: c.count, TotalSpent: c.total.toFixed(2),
      }))));
    }
  };

  return (
    <ReportFrame
      title="Customer Transactions"
      onBack={onBack}
      onExport={handleExport}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <PresetBar preset={preset} onChange={(p) => { setSelected(null); setPreset(p); }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name…"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
          />
        </div>
      }
    >
      {q.isLoading ? <EmptyState label="Loading…" /> :
        selected ? (() => {
          const c = customers.find((x) => x.id === selected);
          if (!c) return <EmptyState label="Customer not found." />;
          return (
            <>
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-blue-700 hover:underline"
              >
                ← All customers
              </button>
              <StatGrid
                stats={[
                  { label: "Customer", value: c.name },
                  { label: "Transactions", value: String(c.count) },
                  { label: "Total Spent", value: fmtAED(c.total), accent: "good" },
                  { label: "Period", value: range.label },
                ]}
              />
              <div className="bg-white border border-gray-200 rounded overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2 text-right">VAT</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{s.invoiceNumber}</td>
                        <td className="px-4 py-2 text-gray-600">{fmtDateTime(s.createdAtClient)}</td>
                        <td className="px-4 py-2 capitalize">{s.paymentMethod}</td>
                        <td className="px-4 py-2 text-right">{fmtAED(n(s.vatAmount))}</td>
                        <td className="px-4 py-2 text-right font-semibold">{fmtAED(n(s.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })() :
        filtered.length === 0 ? <EmptyState label="No customers found." /> : (
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Txns</th>
                  <th className="px-4 py-2 text-right">Total Spent</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(c.id)}
                  >
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-right">{c.count}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmtAED(c.total)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Daily item detail                                                     */
/* ------------------------------------------------------------------------ */

function ItemsReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [day, setDay] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  const range = useMemo(() => {
    const s = new Date(`${day}T00:00:00.000`);
    const e = new Date(`${day}T23:59:59.999`);
    return { from: s.toISOString(), to: e.toISOString() };
  }, [day]);

  const q = useQuery({
    queryKey: ["items-day", branchId, day],
    queryFn: async () => {
      const sales = await api.salesAll(token, branchId, range);
      return { sales };
    },
  });

  const sales = q.data?.sales ?? [];
  const valid = validSalesOf(sales);
  const total = valid.reduce((sum, s) => sum + n(s.total), 0);
  const refundCount = sales.filter((s) => s.isRefund).length;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleExport = () => {
    if (sales.length === 0) return alert("Nothing to export.");
    const rows: Record<string, unknown>[] = [];
    for (const s of sales) {
      const items = s.payload?.items ?? [];
      if (items.length === 0) {
        rows.push({
          Date: s.createdAtClient, Invoice: s.invoiceNumber,
          Item: "", Quantity: "", UnitPrice: "", LineTotal: "",
          Cashier: s.payload?.staffName ?? "", Customer: s.payload?.customerName ?? "",
          Refund: s.isRefund ? "yes" : "no",
        });
      } else {
        for (const it of items) {
          rows.push({
            Date: s.createdAtClient, Invoice: s.invoiceNumber,
            Item: it.productName, Quantity: it.quantity,
            UnitPrice: n(it.productPrice).toFixed(2),
            LineTotal: n(it.lineTotal).toFixed(2),
            Cashier: s.payload?.staffName ?? "",
            Customer: s.payload?.customerName ?? "",
            Refund: s.isRefund ? "yes" : "no",
          });
        }
      }
    }
    downloadCsv("daily-items", buildCsv(rows));
  };

  const isToday = day === new Date().toISOString().slice(0, 10);
  const stepDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(d.toISOString().slice(0, 10));
  };

  return (
    <ReportFrame
      title="Daily Sales Detail"
      onBack={onBack}
      onExport={handleExport}
      controls={
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepDay(-1)}
            className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50"
          >‹</button>
          <input
            type="date"
            value={day}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDay(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => stepDay(1)}
            disabled={isToday}
            className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
          >›</button>
        </div>
      }
    >
      <StatGrid
        stats={[
          { label: "Sales", value: String(valid.length) },
          { label: "Refunds", value: String(refundCount), accent: refundCount > 0 ? "bad" : undefined },
          { label: "Revenue", value: fmtAED(total), accent: "good" },
          { label: "Avg. Order", value: fmtAED(valid.length > 0 ? total / valid.length : 0) },
        ]}
      />
      {q.isLoading ? <EmptyState label="Loading…" /> :
        sales.length === 0 ? <EmptyState label="No sales on this day." /> : (
        <div className="space-y-2">
          {sales.map((s) => {
            const items: SalePayload["items"] = s.payload?.items ?? [];
            const isExp = expandedId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setExpandedId(isExp ? null : s.id)}
                className={
                  "w-full text-left bg-white border rounded p-4 " +
                  (s.isRefund ? "border-rose-200" : "border-gray-200")
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {s.invoiceNumber}
                      {s.isRefund ? " · REFUND" : ""}
                    </div>
                    <div className="text-xs text-gray-500">
                      {fmtTime(s.createdAtClient)}
                      {s.payload?.staffName ? ` · ${s.payload.staffName}` : ""}
                      {s.payload?.customerName ? ` · ${s.payload.customerName}` : ""}
                      {" · "}{s.paymentMethod}
                    </div>
                  </div>
                  <div className={"font-semibold " + (s.isRefund ? "text-rose-600" : "text-emerald-600")}>
                    {fmtAED(n(s.total))}
                  </div>
                </div>
                {isExp && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
                    <div className="grid grid-cols-2 gap-y-1 text-gray-600">
                      {s.payload?.orderType ? (
                        <><div>Order Type</div><div className="text-right capitalize">{s.payload.orderType}</div></>
                      ) : null}
                      <div>Subtotal</div><div className="text-right">{fmtAED(n(s.payload?.subtotal))}</div>
                      <div>VAT</div><div className="text-right">{fmtAED(n(s.vatAmount))}</div>
                      {n(s.payload?.discountAmount) > 0 ? (
                        <><div>Discount</div><div className="text-right text-amber-600">-{fmtAED(n(s.payload?.discountAmount))}</div></>
                      ) : null}
                    </div>
                    {items && items.length > 0 ? (
                      <>
                        <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-3 mb-1">Items</div>
                        <div className="space-y-1">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center text-sm">
                              <span className="flex-1">{it.productName}</span>
                              <span className="w-12 text-center text-gray-500">×{it.quantity}</span>
                              <span className="w-24 text-right font-medium">{fmtAED(n(it.lineTotal))}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </ReportFrame>
  );
}
