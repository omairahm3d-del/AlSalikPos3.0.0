import { Alert, Platform } from "react-native";

export interface PdfColumn {
  header: string;
  align?: "left" | "center" | "right";
}

export interface PdfSummaryRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface ReportPdfOptions {
  title: string;
  filters: string[];
  summary?: PdfSummaryRow[];
  columns: PdfColumn[];
  rows: (string | number)[][];
  footerNote?: string;
}

export function generateReportPdfHtml(opts: ReportPdfOptions): string {
  const { title, filters, summary, columns, rows, footerNote } = opts;
  const generatedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const thCells = columns
    .map(c => `<th style="text-align:${c.align ?? "left"}">${c.header}</th>`)
    .join("");

  const bodyRows = rows.map((row, i) => {
    const tds = row.map((cell, ci) =>
      `<td style="text-align:${columns[ci]?.align ?? "left"}">${cell}</td>`
    ).join("");
    return `<tr class="${i % 2 === 0 ? "even" : "odd"}">${tds}</tr>`;
  }).join("");

  const filterHtml = filters.length
    ? filters.map(f => `<span class="filter-chip">${f}</span>`).join(" ")
    : "";

  const summaryHtml = summary && summary.length > 0
    ? `<table class="summary-table">
        <tbody>
          ${summary.map(r =>
            `<tr>
              <td class="sum-label">${r.label}</td>
              <td class="sum-value${r.highlight ? " highlight" : ""}">${r.value}</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      color: #111;
      padding: 28px 32px;
      background: #fff;
    }
    .report-header {
      border-bottom: 2px solid #1a56db;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .report-title {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 6px;
    }
    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .filter-chip {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      color: #1e40af;
      font-weight: 600;
    }
    .generated {
      font-size: 11px;
      color: #888;
      margin-top: 4px;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .sum-label {
      padding: 6px 12px;
      color: #64748b;
      font-size: 12px;
      width: 50%;
    }
    .sum-value {
      padding: 6px 12px;
      font-weight: 600;
      text-align: right;
    }
    .sum-value.highlight {
      color: #16a34a;
    }
    table.main-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.main-table th {
      background: #1a56db;
      color: #fff;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    table.main-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e8edf2;
      color: #222;
    }
    table.main-table tr.even td {
      background: #f8fafc;
    }
    table.main-table tr.odd td {
      background: #fff;
    }
    .footer {
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      font-size: 11px;
      color: #888;
      text-align: right;
    }
    .footer-note {
      margin-top: 10px;
      font-size: 11px;
      color: #555;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 6px 10px;
    }
    @media print {
      body { padding: 0; }
      .report-header { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">${title}</div>
    ${filterHtml ? `<div class="filter-chips">${filterHtml}</div>` : ""}
    <div class="generated">Generated: ${generatedAt}</div>
  </div>

  ${summaryHtml}

  ${rows.length === 0
    ? `<p style="color:#888;text-align:center;margin:32px 0">No data for the selected filters.</p>`
    : `<table class="main-table">
        <thead><tr>${thCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>`
  }

  ${footerNote ? `<div class="footer-note">${footerNote}</div>` : ""}
  <div class="footer">Al Salik POS &nbsp;·&nbsp; ${title}</div>
</body>
</html>`;
}

export async function printReportPdf(html: string, reportName = "report"): Promise<void> {
  try {
    if (Platform.OS === "web") {
      const w = window.open("", "_blank", "width=860,height=660");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 400);
      }
    } else {
      const Print = await import("expo-print");
      await Print.printAsync({ html });
    }
  } catch (e: any) {
    Alert.alert("PDF Export Failed", e?.message || String(e));
  }
}
