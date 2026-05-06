/**
 * Tiny CSV builder + browser downloader. Mirrors the POS app's csvExport so
 * Back Office reports produce the same column layout and quoting rules.
 */

function escapeCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(
  rows: Array<Record<string, unknown>>,
  headers?: string[],
): string {
  if (rows.length === 0) return (headers ?? []).join(",") + "\n";
  const cols = headers ?? Object.keys(rows[0]!);
  const head = cols.map(escapeCell).join(",");
  const body = rows
    .map((r) => cols.map((c) => escapeCell(r[c])).join(","))
    .join("\n");
  return head + "\n" + body + "\n";
}

export function downloadCsv(slug: string, csv: string): void {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fmtAED(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
  }).format(n);
}
