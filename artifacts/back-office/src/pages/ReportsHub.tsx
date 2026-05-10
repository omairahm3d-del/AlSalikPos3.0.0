import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  | "items"
  | "stylist"
  | "vat-sales"
  | "vat-purchases";

const BASE_HUB_ITEMS: {
  key: Exclude<View, null>;
  title: string;
  sub: string;
  color: string;
  saloonOnly?: boolean;
  saloonHide?: boolean;
}[] = [
  { key: "daily", title: "Daily Sales (Z-style)", sub: "End-of-day roll-up: net sales, VAT, transactions per day", color: "#E74C3C" },
  { key: "payment", title: "Payment Method Report", sub: "Revenue breakdown by cash, card & credit", color: "#4F8EF7" },
  { key: "staff", title: "Staff Sales Report", sub: "Performance per staff member", color: "#2ECC71" },
  { key: "stylist", title: "Stylist Report", sub: "Revenue and service count per stylist", color: "#E91E8C", saloonOnly: true },
  { key: "rider", title: "Rider Delivery Report", sub: "Deliveries and revenue per rider", color: "#3498DB", saloonHide: true },
  { key: "customer", title: "Customer Transactions", sub: "Transaction history per customer", color: "#9B59B6" },
  { key: "items", title: "Daily Item Detail", sub: "Full transaction & line-item breakdown", color: "#F39C12" },
  { key: "vat-sales", title: "Sales VAT Filing", sub: "Output VAT return — taxable supplies & VAT collected", color: "#16a34a" },
  { key: "vat-purchases", title: "Purchase VAT Filing", sub: "Input VAT return — taxable purchases & VAT recoverable", color: "#7c3aed" },
];

export default function ReportsHub({
  token,
  branchId,
  workMode,
}: {
  token: string;
  branchId: string;
  workMode?: "standard" | "saloon" | "laundry";
}) {
  const isSaloon = workMode === "saloon";
  const [view, setView] = useState<View>(null);
  const HUB_ITEMS = BASE_HUB_ITEMS.filter((it) => {
    if (it.saloonOnly && !isSaloon) return false;
    if (it.saloonHide && isSaloon) return false;
    return true;
  });

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
    case "stylist": return <StylistReport {...common} />;
    case "rider": return <RiderReport {...common} />;
    case "customer": return <CustomerReport {...common} />;
    case "items": return <ItemsReport {...common} />;
    case "vat-sales": return <VatSalesReport {...common} />;
    case "vat-purchases": return <VatPurchasesReport {...common} />;
  }
}

/* ------------------------------------------------------------------------ */
/* VAT Sales Filing Report                                                  */
/* ------------------------------------------------------------------------ */

function VatSalesReport({ token, branchId, onBack }: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("thismonth");
  const { range, q } = useRangeSales(token, branchId, preset);
  const sales = q.data?.sales ?? [];
  const txns = useMemo(() => sales.filter(s => !s.isRefund), [sales]);
  const refunds = useMemo(() => sales.filter(s => s.isRefund), [sales]);

  const totals = useMemo(() => {
    const taxableSupplies = txns.reduce((sum, s) => sum + n(s.payload?.subtotal ?? s.total), 0);
    const outputVat = txns.reduce((sum, s) => sum + n(s.vatAmount), 0);
    const totalInclVat = txns.reduce((sum, s) => sum + n(s.total), 0);
    const refundSubtotal = refunds.reduce((sum, s) => sum + Math.abs(n(s.payload?.subtotal ?? s.total)), 0);
    const refundVat = refunds.reduce((sum, s) => sum + Math.abs(n(s.vatAmount)), 0);
    const netVat = outputVat - refundVat;
    return { taxableSupplies, outputVat, totalInclVat, refundSubtotal, refundVat, netVat };
  }, [txns, refunds]);

  const handleExport = () => {
    if (txns.length === 0) return alert("Nothing to export.");
    downloadCsv("sales-vat-filing", buildCsv([
      ...txns.map(s => ({
        Date: fmtDate(s.createdAtClient), Invoice: s.invoiceNumber,
        Customer: s.payload?.customerName ?? "", Method: s.paymentMethod,
        ExclVAT: n(s.payload?.subtotal ?? s.total).toFixed(2),
        VAT: n(s.vatAmount).toFixed(2), Total: n(s.total).toFixed(2),
      })),
      ...refunds.map(s => ({
        Date: fmtDate(s.createdAtClient), Invoice: `${s.invoiceNumber} (Refund)`,
        Customer: s.payload?.customerName ?? "", Method: s.paymentMethod,
        ExclVAT: (-Math.abs(n(s.payload?.subtotal ?? s.total))).toFixed(2),
        VAT: (-Math.abs(n(s.vatAmount))).toFixed(2), Total: (-Math.abs(n(s.total))).toFixed(2),
      })),
    ]));
  };

  const handlePrint = () => {
    const rows = [
      ...txns.map(s => `<tr><td>${fmtDate(s.createdAtClient)}</td><td>${s.invoiceNumber}</td><td>${s.payload?.customerName ?? "—"}</td><td>${s.paymentMethod}</td><td style="text-align:right">${fmtAED(n(s.payload?.subtotal ?? s.total))}</td><td style="text-align:right;color:#b91c1c">${fmtAED(n(s.vatAmount))}</td><td style="text-align:right;font-weight:600">${fmtAED(n(s.total))}</td></tr>`),
      ...refunds.map(s => `<tr style="background:#fff5f5"><td>${fmtDate(s.createdAtClient)}</td><td style="color:#b91c1c">${s.invoiceNumber} <small>REFUND</small></td><td>${s.payload?.customerName ?? "—"}</td><td>${s.paymentMethod}</td><td style="text-align:right;color:#b91c1c">-${fmtAED(Math.abs(n(s.payload?.subtotal ?? s.total)))}</td><td style="text-align:right;color:#b91c1c">-${fmtAED(Math.abs(n(s.vatAmount)))}</td><td style="text-align:right;color:#b91c1c;font-weight:600">-${fmtAED(Math.abs(n(s.total)))}</td></tr>`),
    ].join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Sales VAT Filing — ${range.label}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}p{margin:0 0 16px;color:#555;font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:12px}th{background:#166534;color:#fff;padding:7px 10px;text-align:left}
      td{padding:6px 10px;border-bottom:1px solid #eee}tfoot td{background:#f4f4f4;font-weight:700;border-top:2px solid #ccc}
      .box{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:14px;margin-bottom:16px;font-size:13px}
      .box-row{display:flex;justify-content:space-between;padding:3px 0}.box-row.total{border-top:1px solid #86efac;margin-top:6px;padding-top:6px;font-weight:700}</style></head>
      <body><h2>Sales VAT Filing Report</h2><p>Period: ${range.label} &nbsp;·&nbsp; Generated ${new Date().toLocaleString("en-GB")}</p>
      <div class="box"><div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;color:#166534">UAE VAT Return — Output Tax (Box 1)</div>
      <div class="box-row"><span>Taxable Supplies (excl. VAT)</span><span>${fmtAED(totals.taxableSupplies)}</span></div>
      <div class="box-row"><span>VAT Rate</span><span>5%</span></div>
      <div class="box-row"><span>Output VAT Due</span><span style="color:#b91c1c">${fmtAED(totals.outputVat)}</span></div>
      ${totals.refundVat > 0 ? `<div class="box-row"><span>Refund VAT Adj. (Box 7)</span><span style="color:#d97706">-${fmtAED(totals.refundVat)}</span></div>` : ""}
      <div class="box-row total"><span>Net VAT Payable</span><span style="color:#b91c1c">${fmtAED(totals.netVat)}</span></div></div>
      <table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th style="text-align:right">Excl. VAT</th><th style="text-align:right">VAT 5%</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">Total (${txns.length} sales)</td><td style="text-align:right">${fmtAED(totals.taxableSupplies)}</td><td style="text-align:right;color:#b91c1c">${fmtAED(totals.outputVat)}</td><td style="text-align:right">${fmtAED(totals.totalInclVat)}</td></tr></tfoot>
      </table></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch {} }, 400); }
  };

  return (
    <ReportFrame title="Sales VAT Filing" onBack={onBack} onExport={handleExport} onPrint={handlePrint}
      controls={<PresetBar preset={preset} onChange={setPreset} />}>
      <StatGrid stats={[
        { label: "Period", value: range.label },
        { label: "Taxable Supplies (excl. VAT)", value: fmtAED(totals.taxableSupplies) },
        { label: "Output VAT Due (5%)", value: fmtAED(totals.outputVat), accent: "bad" },
        { label: "Refund VAT Adj.", value: totals.refundVat > 0 ? `-${fmtAED(totals.refundVat)}` : "—", accent: totals.refundVat > 0 ? "warn" : undefined },
        { label: "Net VAT Payable", value: fmtAED(totals.netVat), accent: "bad" },
        { label: "Total Revenue (incl. VAT)", value: fmtAED(totals.totalInclVat), accent: "good" },
        { label: "Transactions", value: String(txns.length) },
        { label: "Refunds", value: refunds.length > 0 ? String(refunds.length) : "—" },
      ]} />
      {q.isLoading ? <EmptyState label="Loading…" /> : txns.length === 0 && refunds.length === 0 ? (
        <EmptyState label={`No taxable sales in ${range.label}`} />
      ) : (
        <div className="space-y-3">
          {/* UAE VAT Return box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-3">UAE VAT Return — Output Tax (Box 1)</div>
            <div className="grid grid-cols-2 gap-y-1.5 text-emerald-900">
              <div>Taxable Supplies (excl. VAT)</div><div className="text-right font-medium">{fmtAED(totals.taxableSupplies)}</div>
              <div>VAT Rate</div><div className="text-right font-medium">5%</div>
              <div className="font-semibold">Output VAT Due</div><div className="text-right font-bold text-rose-700">{fmtAED(totals.outputVat)}</div>
              {totals.refundVat > 0 && <>
                <div className="text-amber-700">Refund VAT Adj. (Box 7)</div>
                <div className="text-right text-amber-700 font-medium">-{fmtAED(totals.refundVat)}</div>
              </>}
              <div className="border-t border-emerald-300 pt-2 font-bold">Net VAT Payable</div>
              <div className="border-t border-emerald-300 pt-2 text-right font-bold text-rose-700">{fmtAED(totals.netVat)}</div>
            </div>
          </div>
          {/* Transaction table */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Transaction Detail</div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-700 text-white">
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Invoice</th>
                    <th className="px-3 py-2 text-left font-semibold">Customer</th>
                    <th className="px-3 py-2 text-left font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">Excl. VAT</th>
                    <th className="px-3 py-2 text-right font-semibold">VAT (5%)</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map(s => (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">{fmtDate(s.createdAtClient)}</td>
                      <td className="px-3 py-2 font-medium">{s.invoiceNumber}</td>
                      <td className="px-3 py-2 text-gray-500">{s.payload?.customerName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{s.paymentMethod}</td>
                      <td className="px-3 py-2 text-right">{fmtAED(n(s.payload?.subtotal ?? s.total))}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{fmtAED(n(s.vatAmount))}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtAED(n(s.total))}</td>
                    </tr>
                  ))}
                  {refunds.map(s => (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0 bg-rose-50">
                      <td className="px-3 py-2 text-gray-500">{fmtDate(s.createdAtClient)}</td>
                      <td className="px-3 py-2 font-medium text-rose-700">{s.invoiceNumber} <span className="text-[10px] bg-rose-100 px-1 py-0.5 rounded">REFUND</span></td>
                      <td className="px-3 py-2 text-gray-500">{s.payload?.customerName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{s.paymentMethod}</td>
                      <td className="px-3 py-2 text-right text-rose-700">-{fmtAED(Math.abs(n(s.payload?.subtotal ?? s.total)))}</td>
                      <td className="px-3 py-2 text-right text-rose-700">-{fmtAED(Math.abs(n(s.vatAmount)))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700">-{fmtAED(Math.abs(n(s.total)))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                    <td colSpan={4} className="px-3 py-2">Total ({txns.length} sales{refunds.length > 0 ? `, ${refunds.length} refunds` : ""})</td>
                    <td className="px-3 py-2 text-right">{fmtAED(totals.taxableSupplies)}</td>
                    <td className="px-3 py-2 text-right text-rose-700">{fmtAED(totals.outputVat)}</td>
                    <td className="px-3 py-2 text-right">{fmtAED(totals.totalInclVat)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* VAT Purchases Filing Report                                              */
/* ------------------------------------------------------------------------ */

function VatPurchasesReport({ token, branchId, onBack }: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("thismonth");
  const { range, q } = useRangePurchases(token, branchId, preset);

  const purchases = useMemo(() => {
    const from = new Date(range.from).getTime();
    const to = new Date(range.to).getTime();
    return (q.data?.purchases ?? []).filter(p => {
      const t = new Date(p.receivedAt).getTime();
      return t >= from && t <= to;
    }).sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }, [q.data, range]);

  const totals = useMemo(() => {
    const subtotal = purchases.reduce((s, p) => s + n(p.subtotal), 0);
    const inputVat = purchases.reduce((s, p) => s + n(p.vatAmount), 0);
    const total = purchases.reduce((s, p) => s + n(p.total), 0);
    return { subtotal, inputVat, total };
  }, [purchases]);

  const handleExport = () => {
    if (purchases.length === 0) return alert("Nothing to export.");
    downloadCsv("purchase-vat-filing", buildCsv(purchases.map(p => ({
      Date: fmtDate(p.receivedAt), Reference: p.referenceNumber ?? "",
      Supplier: p.supplierName,
      ExclVAT: n(p.subtotal).toFixed(2), VAT: n(p.vatAmount).toFixed(2), Total: n(p.total).toFixed(2),
    }))));
  };

  const handlePrint = () => {
    const rows = purchases.map(p =>
      `<tr><td>${fmtDate(p.receivedAt)}</td><td>${p.referenceNumber ?? "—"}</td><td>${p.supplierName}</td><td style="text-align:right">${fmtAED(n(p.subtotal))}</td><td style="text-align:right;color:#7c3aed">${fmtAED(n(p.vatAmount))}</td><td style="text-align:right;font-weight:600">${fmtAED(n(p.total))}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Purchase VAT Filing — ${range.label}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}p{margin:0 0 16px;color:#555;font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:12px}th{background:#5b21b6;color:#fff;padding:7px 10px;text-align:left}
      td{padding:6px 10px;border-bottom:1px solid #eee}tfoot td{background:#f4f4f4;font-weight:700;border-top:2px solid #ccc}
      .box{background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;padding:14px;margin-bottom:16px;font-size:13px}
      .box-row{display:flex;justify-content:space-between;padding:3px 0}.box-row.total{border-top:1px solid #c4b5fd;margin-top:6px;padding-top:6px;font-weight:700}</style></head>
      <body><h2>Purchase VAT Filing Report</h2><p>Period: ${range.label} &nbsp;·&nbsp; Generated ${new Date().toLocaleString("en-GB")}</p>
      <div class="box"><div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;color:#5b21b6">UAE VAT Return — Input Tax (Box 9)</div>
      <div class="box-row"><span>Taxable Purchases (excl. VAT)</span><span>${fmtAED(totals.subtotal)}</span></div>
      <div class="box-row"><span>VAT Rate</span><span>5%</span></div>
      <div class="box-row total"><span>Input VAT Recoverable</span><span style="color:#5b21b6">${fmtAED(totals.inputVat)}</span></div>
      <div class="box-row"><span>Total Purchases (incl. VAT)</span><span>${fmtAED(totals.total)}</span></div></div>
      <table><thead><tr><th>Date</th><th>Reference</th><th>Supplier</th><th style="text-align:right">Excl. VAT</th><th style="text-align:right">VAT 5%</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total (${purchases.length} GRNs)</td><td style="text-align:right">${fmtAED(totals.subtotal)}</td><td style="text-align:right;color:#7c3aed">${fmtAED(totals.inputVat)}</td><td style="text-align:right">${fmtAED(totals.total)}</td></tr></tfoot>
      </table></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch {} }, 400); }
  };

  return (
    <ReportFrame title="Purchase VAT Filing" onBack={onBack} onExport={handleExport} onPrint={handlePrint}
      controls={<PresetBar preset={preset} onChange={setPreset} />}>
      <StatGrid stats={[
        { label: "Period", value: range.label },
        { label: "Taxable Purchases (excl. VAT)", value: fmtAED(totals.subtotal) },
        { label: "Input VAT Recoverable (5%)", value: fmtAED(totals.inputVat), accent: "good" },
        { label: "Total Purchases (incl. VAT)", value: fmtAED(totals.total) },
        { label: "GRN Count", value: String(purchases.length) },
      ]} />
      {q.isLoading ? <EmptyState label="Loading…" /> : purchases.length === 0 ? (
        <EmptyState label={`No purchase records in ${range.label}`} />
      ) : (
        <div className="space-y-3">
          {/* UAE Input VAT box */}
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800 mb-3">UAE VAT Return — Input Tax (Box 9)</div>
            <div className="grid grid-cols-2 gap-y-1.5 text-violet-900">
              <div>Taxable Purchases (excl. VAT)</div><div className="text-right font-medium">{fmtAED(totals.subtotal)}</div>
              <div>VAT Rate</div><div className="text-right font-medium">5%</div>
              <div className="font-semibold">Input VAT Recoverable</div><div className="text-right font-bold text-violet-700">{fmtAED(totals.inputVat)}</div>
              <div className="border-t border-violet-300 pt-2">Total Purchases (incl. VAT)</div>
              <div className="border-t border-violet-300 pt-2 text-right font-semibold">{fmtAED(totals.total)}</div>
            </div>
          </div>
          {/* GRN table */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Goods Received Detail</div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-violet-700 text-white">
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Reference</th>
                    <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                    <th className="px-3 py-2 text-right font-semibold">Excl. VAT</th>
                    <th className="px-3 py-2 text-right font-semibold">VAT (5%)</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">{fmtDate(p.receivedAt)}</td>
                      <td className="px-3 py-2 font-medium">{p.referenceNumber ?? "—"}</td>
                      <td className="px-3 py-2">{p.supplierName}</td>
                      <td className="px-3 py-2 text-right">{fmtAED(n(p.subtotal))}</td>
                      <td className="px-3 py-2 text-right text-violet-700">{fmtAED(n(p.vatAmount))}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtAED(n(p.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                    <td colSpan={3} className="px-3 py-2">Total ({purchases.length} GRN{purchases.length !== 1 ? "s" : ""})</td>
                    <td className="px-3 py-2 text-right">{fmtAED(totals.subtotal)}</td>
                    <td className="px-3 py-2 text-right text-violet-700">{fmtAED(totals.inputVat)}</td>
                    <td className="px-3 py-2 text-right">{fmtAED(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------------------ */
/* 3b. Stylist (saloon mode)                                                */
/* ------------------------------------------------------------------------ */

function StylistReport({
  token, branchId, onBack,
}: { token: string; branchId: string; onBack: () => void }) {
  const [preset, setPreset] = useState<Preset>("last7");
  const { range, q } = useRangeSales(token, branchId, preset);
  const valid = validSalesOf(q.data?.sales ?? []);

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const s of valid) {
      const items: Array<{ stylistName?: string; lineTotal?: number }> =
        (s.payload as any)?.items ?? [];
      for (const it of items) {
        const name = it.stylistName || "Unassigned";
        const ex = map.get(name);
        const amt = n(it.lineTotal);
        if (ex) { ex.count++; ex.amount += amt; }
        else map.set(name, { count: 1, amount: amt });
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const total = stats.reduce((sum, s) => sum + s.amount, 0);

  const handleExport = () => {
    if (stats.length === 0) return alert("Nothing to export.");
    downloadCsv("stylist-report", buildCsv(stats.map((s) => ({
      Stylist: s.name, Services: s.count,
      TotalRevenue: s.amount.toFixed(2), AvgOrder: s.avg.toFixed(2),
    }))));
  };

  return (
    <ReportFrame
      title="Stylist Report"
      onBack={onBack}
      onExport={handleExport}
      controls={<PresetBar preset={preset} onChange={setPreset} />}
    >
      <StatGrid
        stats={[
          { label: "Period", value: range.label },
          { label: "Total Revenue", value: fmtAED(total), accent: "good" },
          { label: "Stylists", value: String(stats.length) },
        ]}
      />
      {q.isLoading ? <EmptyState label="Loading…" /> :
        stats.length === 0 ? <EmptyState label={`No stylist data in ${range.label}`} /> : (
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={s.name} className="bg-white border border-gray-200 rounded p-4">
              <div className="flex items-center gap-3">
                <span
                  className={
                    "w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold " +
                    (i === 0 ? "bg-pink-500 text-white" : "bg-gray-100 text-gray-600")
                  }
                >
                  #{i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.count} service{s.count !== 1 ? "s" : ""} · Avg {fmtAED(s.avg)}
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
/* Shared building blocks                                                   */
/* ------------------------------------------------------------------------ */

function ReportFrame({
  title,
  onBack,
  onExport,
  onPrint,
  controls,
  children,
}: {
  title: string;
  onBack: () => void;
  onExport?: () => void;
  onPrint?: () => void;
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
        <div className="ml-auto flex items-center gap-2">
          {onPrint ? (
            <button
              onClick={onPrint}
              className="text-xs font-semibold text-violet-700 border border-violet-200 hover:bg-violet-50 rounded px-2.5 py-1.5"
            >
              ⎙ Print / PDF
            </button>
          ) : null}
          {onExport ? (
            <button
              onClick={onExport}
              className="text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded px-2.5 py-1.5"
            >
              ↓ CSV
            </button>
          ) : null}
        </div>
      </div>
      {controls}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* useRangePurchases — fetch purchases for the active date preset           */
/* ------------------------------------------------------------------------ */

function useRangePurchases(token: string, branchId: string, preset: Preset) {
  const range = useMemo(() => presetRange(preset), [preset]);
  const q = useQuery({
    queryKey: ["range-purchases", branchId, preset],
    queryFn: () => api.purchases(token, branchId, { from: range.from, to: range.to }),
  });
  return { range, q };
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
  const qc = useQueryClient();
  const [day, setDay] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundedIds, setRefundedIds] = useState<Set<string>>(new Set());
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

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

  const refundMutation = useMutation({
    mutationFn: (clientSaleId: string) => api.refundSale(token, clientSaleId),
    onSuccess: (data, clientSaleId) => {
      setRefundedIds((prev) => new Set([...prev, clientSaleId]));
      setRefundMsg(`Refund created: ${data.invoiceNumber}`);
      void qc.invalidateQueries({ queryKey: ["items-day", branchId, day] });
      void qc.invalidateQueries({ queryKey: ["range-sales", branchId] });
      setTimeout(() => setRefundMsg(null), 4000);
    },
  });

  const sales = q.data?.sales ?? [];
  const valid = validSalesOf(sales);
  const total = valid.reduce((sum, s) => sum + n(s.total), 0);
  const refundCount = sales.filter((s) => s.isRefund).length;

  function handleRefund(s: SaleRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !window.confirm(
        `Issue a full refund for ${s.invoiceNumber} (${fmtAED(n(s.total))})?`,
      )
    )
      return;
    refundMutation.mutate(s.clientSaleId);
  }

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

      {refundMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-4 py-2 text-sm text-emerald-800 flex items-center justify-between">
          <span>{refundMsg}</span>
          <button onClick={() => setRefundMsg(null)} className="ml-4 text-emerald-600">✕</button>
        </div>
      )}
      {refundMutation.error && (
        <div className="bg-rose-50 border border-rose-200 rounded px-4 py-2 text-sm text-rose-800">
          {(refundMutation.error as Error).message}
        </div>
      )}

      {q.isLoading ? <EmptyState label="Loading…" /> :
        sales.length === 0 ? <EmptyState label="No sales on this day." /> : (
        <div className="space-y-2">
          {sales.map((s) => {
            const items: SalePayload["items"] = s.payload?.items ?? [];
            const isExp = expandedId === s.id;
            const alreadyRefunded =
              refundedIds.has(s.clientSaleId) ||
              sales.some((r) => r.isRefund && r.payload?.originalClientSaleId === s.clientSaleId);
            const canRefund = !s.isRefund && !alreadyRefunded;
            return (
              <div
                key={s.id}
                className={
                  "bg-white border rounded overflow-hidden " +
                  (s.isRefund ? "border-rose-200" : "border-gray-200")
                }
              >
                {/* Header row — click to expand */}
                <button
                  onClick={() => setExpandedId(isExp ? null : s.id)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">
                        {s.invoiceNumber}
                        {s.isRefund ? (
                          <span className="ml-2 text-xs font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                            REFUND
                          </span>
                        ) : alreadyRefunded ? (
                          <span className="ml-2 text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            REFUNDED
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {fmtTime(s.createdAtClient)}
                        {s.payload?.staffName ? ` · ${s.payload.staffName}` : ""}
                        {s.payload?.customerName ? ` · ${s.payload.customerName}` : ""}
                        {" · "}{s.paymentMethod}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={"font-semibold " + (s.isRefund ? "text-rose-600" : "text-emerald-600")}>
                        {s.isRefund ? "-" : ""}{fmtAED(Math.abs(n(s.total)))}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExp && (
                  <div className="px-4 pb-4 border-t border-gray-100 text-sm">
                    <div className="grid grid-cols-2 gap-y-1 text-gray-600 pt-3">
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
                    {canRefund && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                        <button
                          onClick={(e) => handleRefund(s, e)}
                          disabled={refundMutation.isPending}
                          className="text-xs font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 rounded px-3 py-1.5 disabled:opacity-50"
                        >
                          {refundMutation.isPending ? "Processing…" : "↩ Issue Refund"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ReportFrame>
  );
}
