import type { BusinessSettings, ReceiptDesignSettings, Sale, SaleItem } from "@/types";
import { CURRENCY, DEFAULT_RECEIPT_DESIGN } from "@/types";

function fmt(amount: number): string {
  return `${CURRENCY} ${Math.abs(amount).toFixed(2)}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} ${time}`;
}

function getFontSize(size: ReceiptDesignSettings["fontSize"]): { body: number; header: number; title: number } {
  switch (size) {
    case "small": return { body: 10, header: 12, title: 11 };
    case "large": return { body: 14, header: 16, title: 15 };
    default: return { body: 12, header: 14, title: 13 };
  }
}

function getPaperWidth(width: ReceiptDesignSettings["paperWidth"]): string {
  return width === "58mm" ? "48mm" : "72mm";
}

export function generateReceiptHTML(
  sale: Sale,
  items: SaleItem[],
  business: BusinessSettings,
  design?: ReceiptDesignSettings
): string {
  const rd = design ?? business.receiptDesign ?? DEFAULT_RECEIPT_DESIGN;
  const vatPct = Math.round(sale.vatRate * 100);
  const isRefund = sale.isRefund;
  const fs = getFontSize(rd.fontSize);
  const pw = getPaperWidth(rd.paperWidth);
  const pageSize = rd.paperWidth === "58mm" ? "58mm" : "80mm";

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:4px 0;text-align:left;">${item.productName}</td>
        <td style="padding:4px 8px;text-align:center;">${Math.abs(item.quantity)}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(item.productPrice)}</td>
        <td style="padding:4px 0;text-align:right;">${fmt(item.lineTotal)}${(item.discountAmount ?? 0) > 0 ? `<br/><small style="color:#2ECC71;">-${fmt(item.discountAmount!)}</small>` : ""}</td>
      </tr>`
    )
    .join("");

  const discountLine = (sale.discountAmount ?? 0) > 0
    ? `<tr><td style="text-align:left;color:#2ECC71;">Discount${sale.discountType === "percentage" ? ` (${sale.discountValue}%)` : ""}</td><td style="text-align:right;color:#2ECC71;">-${fmt(sale.discountAmount!)}</td></tr>`
    : "";

  const headerText = rd.headerText ? `<div class="center" style="font-size:${fs.body}px;margin-bottom:4px;">${rd.headerText.replace(/\n/g, "<br/>")}</div>` : "";

  const footerText = rd.footerText
    ? rd.footerText.replace(/\n/g, "<br/>")
    : "Thank you for your business!<br/>شكراً لتعاملكم معنا";

  const trnLine = rd.showTrn
    ? (business.trn ? `<div>TRN: ${business.trn}</div>` : '<div style="color:#999;">TRN: Not configured</div>')
    : "";

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @page { margin: 4mm; size: ${pageSize} auto; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: ${fs.body}px; color: #000; width: ${pw}; margin: 0 auto; padding: 4mm 0; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .header-title { font-size: ${fs.header}px; font-weight: bold; margin-bottom: 2px; }
    .header-ar { font-size: ${fs.title}px; font-weight: bold; margin-bottom: 4px; }
    .info-line { font-size: ${fs.body - 1}px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: ${fs.body - 1}px; font-weight: bold; padding: 4px 0; border-bottom: 1px solid #000; }
    .total-section td { padding: 2px 0; }
    .grand-total td { font-size: ${fs.header}px; font-weight: bold; padding: 4px 0; }
    .footer { font-size: ${fs.body - 2}px; text-align: center; margin-top: 8px; line-height: 1.5; }
    .refund-banner { background: #E74C3C; color: #fff; padding: 4px 0; font-size: ${fs.header}px; font-weight: bold; text-align: center; margin-bottom: 4px; }
  </style>
</head>
<body>
  ${isRefund ? '<div class="refund-banner">*** REFUND ***</div>' : ""}

  ${headerText}

  <div class="center">
    <div class="header-ar">فاتورة ضريبية مبسطة</div>
    <div class="header-title">SIMPLIFIED TAX INVOICE</div>
  </div>

  <div class="divider"></div>

  <div class="center info-line">
    ${business.businessName ? `<div class="bold" style="font-size:${fs.title}px;">${business.businessName}</div>` : ""}
    ${trnLine}
    ${business.address ? `<div>${business.address}</div>` : ""}
    ${business.phone ? `<div>Tel: ${business.phone}</div>` : ""}
    ${business.email ? `<div>${business.email}</div>` : ""}
  </div>

  <div class="divider"></div>

  <table>
    <tr><td class="info-line"><strong>Invoice #:</strong></td><td class="info-line" style="text-align:right;">${sale.invoiceNumber || "N/A"}</td></tr>
    <tr><td class="info-line"><strong>Date:</strong></td><td class="info-line" style="text-align:right;">${formatDateTime(sale.createdAt)}</td></tr>
    <tr><td class="info-line"><strong>Payment:</strong></td><td class="info-line" style="text-align:right;">${sale.paymentMethod}</td></tr>
    ${sale.customerName ? `<tr><td class="info-line"><strong>Customer:</strong></td><td class="info-line" style="text-align:right;">${sale.customerName}</td></tr>` : ""}
    ${sale.staffName ? `<tr><td class="info-line"><strong>Cashier:</strong></td><td class="info-line" style="text-align:right;">${sale.staffName}</td></tr>` : ""}
    ${sale.tableName ? `<tr><td class="info-line"><strong>Table:</strong></td><td class="info-line" style="text-align:right;">${sale.tableName}</td></tr>` : ""}
    ${isRefund && sale.originalSaleId ? `<tr><td class="info-line"><strong>Ref:</strong></td><td class="info-line" style="text-align:right;">Original Sale</td></tr>` : ""}
  </table>

  <div class="divider"></div>

  <table>
    <thead><tr><th style="text-align:left;">Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <table class="total-section">
    <tr><td style="text-align:left;">Subtotal (Excl. VAT)</td><td style="text-align:right;">${fmt(sale.subtotal)}</td></tr>
    ${discountLine}
    <tr><td style="text-align:left;">VAT (${vatPct}%)</td><td style="text-align:right;">${fmt(sale.vatAmount)}</td></tr>
  </table>

  <div class="divider"></div>

  <table>
    <tr class="grand-total">
      <td style="text-align:left;">${isRefund ? "REFUND TOTAL" : "TOTAL (Incl. VAT)"}</td>
      <td style="text-align:right;">${isRefund ? "-" : ""}${fmt(sale.total)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <div class="footer">
    ${isRefund ? "This is a refund receipt<br/>" : ""}
    Prices are inclusive of ${vatPct}% VAT where applicable<br/>
    ${footerText}
  </div>
</body>
</html>`;
}
