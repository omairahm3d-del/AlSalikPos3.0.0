import type { BusinessSettings, ReceiptDesignSettings, Sale, SaleItem, ZReport } from "@/types";
import { CURRENCY, DEFAULT_RECEIPT_DESIGN } from "@/types";
import { generateBarcodeSVG, generateWhatsAppQRSVG } from "./barcodeSvg";

export interface CreditPaymentReceiptData {
  customerName: string;
  customerPhone?: string;
  paymentMethod: string;
  amountPaid: number;
  remainingBalance: number;
  note?: string;
  paidAt: number;
  invoices: { invoiceNumber: string; total: number; createdAt: number }[];
}

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

  const mT = rd.marginTop ?? 4;
  const mR = rd.marginRight ?? 2;
  const mB = rd.marginBottom ?? 4;
  const mL = rd.marginLeft ?? 2;

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

  const logoMaxW = rd.paperWidth === "58mm" ? 100 : 140;
  const logoSection = rd.showLogo && business.logoBase64
    ? `<div class="center" style="margin-bottom:6px;"><img src="${business.logoBase64}" alt="Logo" style="max-width:${logoMaxW}px;max-height:60px;object-fit:contain;" /></div>`
    : "";

  const bilingual = (en: string, ar: string) =>
    `<span>${en}</span> <span style="font-size:${fs.body - 2}px;color:#444;">/ ${ar}</span>`;

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @page { margin: ${mT}mm ${mR}mm ${mB}mm ${mL}mm; size: ${pageSize} auto; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Tahoma', 'Arial', 'Segoe UI', sans-serif; font-size: ${fs.body}px; color: #000; width: ${pw}; margin: 0 auto; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    /* Arabic glyphs render thinner than Latin in many fonts during thermal print.
       Force bold weight + pure black so they match the English next to them. */
    .ar, [lang="ar"] { font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Arial Unicode MS', sans-serif; direction: rtl; unicode-bidi: embed; color: #000 !important; font-weight: 700; }
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
  ${isRefund ? '<div class="refund-banner">*** REFUND / استرداد ***</div>' : ""}

  ${logoSection}

  ${headerText}

  <div class="center">
    <div class="header-ar ar">فاتورة ضريبية مبسطة</div>
    <div class="header-title">SIMPLIFIED TAX INVOICE</div>
  </div>

  <div class="divider"></div>

  <div class="center info-line">
    ${business.businessName ? `<div class="bold" style="font-size:${fs.title}px;">${business.businessName}</div>` : ""}
    ${trnLine ? trnLine.replace("TRN:", "TRN / الرقم الضريبي:") : ""}
    ${business.address ? `<div>${business.address}</div>` : ""}
    ${business.phone ? `<div>Tel / هاتف: ${business.phone}</div>` : ""}
    ${business.email ? `<div>${business.email}</div>` : ""}
  </div>

  <div class="divider"></div>

  <table>
    <tr><td class="info-line"><strong>${bilingual("Invoice #", "رقم الفاتورة")}:</strong></td><td class="info-line" style="text-align:right;">${sale.invoiceNumber || "N/A"}</td></tr>
    <tr><td class="info-line"><strong>${bilingual("Date", "التاريخ")}:</strong></td><td class="info-line" style="text-align:right;">${formatDateTime(sale.createdAt)}</td></tr>
    <tr><td class="info-line"><strong>${bilingual("Payment", "الدفع")}:</strong></td><td class="info-line" style="text-align:right;">${sale.paymentMethod}</td></tr>
    ${sale.customerName ? `<tr><td class="info-line"><strong>${bilingual("Customer", "العميل")}:</strong></td><td class="info-line" style="text-align:right;">${sale.customerName}</td></tr>` : ""}
    ${sale.staffName ? `<tr><td class="info-line"><strong>${bilingual("Cashier", "الكاشير")}:</strong></td><td class="info-line" style="text-align:right;">${sale.staffName}</td></tr>` : ""}
    ${sale.tableName ? `<tr><td class="info-line"><strong>${bilingual("Table", "طاولة")}:</strong></td><td class="info-line" style="text-align:right;">${sale.tableName}</td></tr>` : ""}
    ${isRefund && sale.originalSaleId ? `<tr><td class="info-line"><strong>${bilingual("Ref", "مرجع")}:</strong></td><td class="info-line" style="text-align:right;">Original Sale / الفاتورة الأصلية</td></tr>` : ""}
  </table>

  <div class="divider"></div>

  <table>
    <thead><tr>
      <th style="text-align:left;">${bilingual("Item", "الصنف")}</th>
      <th style="text-align:center;">${bilingual("Qty", "الكمية")}</th>
      <th style="text-align:right;">${bilingual("Price", "السعر")}</th>
      <th style="text-align:right;">${bilingual("Amount", "المبلغ")}</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <table class="total-section">
    <tr><td style="text-align:left;">${bilingual("Subtotal (Excl. VAT)", "المجموع الفرعي (بدون ضريبة)")}</td><td style="text-align:right;">${fmt(sale.subtotal)}</td></tr>
    ${discountLine ? discountLine.replace(">Discount", ">Discount / الخصم") : ""}
    <tr><td style="text-align:left;">${bilingual(`VAT (${vatPct}%)`, `ضريبة القيمة المضافة (${vatPct}%)`)}</td><td style="text-align:right;">${fmt(sale.vatAmount)}</td></tr>
  </table>

  <div class="divider"></div>

  <table>
    <tr class="grand-total">
      <td style="text-align:left;">${isRefund ? bilingual("REFUND TOTAL", "إجمالي الاسترداد") : bilingual("TOTAL (Incl. VAT)", "الإجمالي (شامل الضريبة)")}</td>
      <td style="text-align:right;">${isRefund ? "-" : ""}${fmt(sale.total)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  ${sale.invoiceNumber ? `<div class="center" style="margin-top:8px;">${generateBarcodeSVG(sale.invoiceNumber, { width: rd.paperWidth === "58mm" ? 160 : 220, height: 36 })}</div>` : ""}

  ${business.phone ? `<div class="center" style="margin-top:10px;">
    <div style="font-size:${fs.body - 2}px;margin-bottom:4px;">Chat with us on WhatsApp / تواصل معنا على واتساب</div>
    ${generateWhatsAppQRSVG(business.phone, rd.paperWidth === "58mm" ? 80 : 100)}
  </div>` : ""}

  <div class="footer">
    ${isRefund ? "This is a refund receipt / هذه فاتورة استرداد<br/>" : ""}
    Prices are inclusive of ${vatPct}% VAT where applicable<br/>
    <span class="ar">الأسعار شاملة ضريبة القيمة المضافة ${vatPct}% حيثما ينطبق</span><br/>
    ${footerText}
    <div style="margin-top:6px;border-top:1px dashed #ccc;padding-top:5px;font-size:${fs.body - 3}px;color:#888;">Powered by Al Salik Computers</div>
  </div>
</body>
</html>`;
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function generateZReportHTML(
  report: ZReport & { id?: string },
  business: BusinessSettings
): string {
  const paymentRows = report.paymentBreakdown
    .map((p) => `<tr><td style="padding:4px 0;">${p.method}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${fmt(p.amount)}</td></tr>`)
    .join("");

  const categoryRows = report.categorySales
    .map((c) => `<tr><td style="padding:4px 0;">${c.category}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${fmt(c.amount)}</td></tr>`)
    .join("");

  const staffRows = report.staffSales
    .map((s) => `<tr><td style="padding:4px 0;">${s.staffName || "Unknown"} <small>(${s.count})</small></td><td style="padding:4px 0;text-align:right;font-weight:600;">${fmt(s.amount)}</td></tr>`)
    .join("");

  const cashDiff = report.closingCash - (report.totalSales - report.totalRefunds);
  const diffLabel = cashDiff >= 0 ? "Over" : "Short";
  const diffColor = cashDiff >= 0 ? "#2ECC71" : "#E74C3C";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @page { margin: 6mm; size: 80mm auto; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Tahoma', 'Arial', 'Segoe UI', sans-serif; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; padding: 4mm 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .ar, [lang="ar"] { font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Arial Unicode MS', sans-serif; direction: rtl; unicode-bidi: embed; color: #000 !important; font-weight: 700; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 2px; }
    .subtitle { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    .section-title { font-size: 12px; font-weight: bold; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-row td { padding: 3px 0; }
    .total-row td { font-size: 14px; font-weight: bold; padding: 4px 0; }
    .footer { font-size: 10px; text-align: center; margin-top: 10px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="center" style="margin-bottom: 2px;">
    <div style="font-size:14px;font-weight:bold;letter-spacing:1px;">*** Z-REPORT ***</div>
    <div class="ar" style="font-size:12px;">تقرير إغلاق الصندوق</div>
  </div>

  <div class="divider"></div>

  <div class="center">
    ${business.businessName ? `<div class="bold" style="font-size:14px;">${business.businessName}</div>` : ""}
    ${business.trn ? `<div>TRN: ${business.trn}</div>` : ""}
    ${business.address ? `<div>${business.address}</div>` : ""}
    ${business.phone ? `<div>Tel: ${business.phone}</div>` : ""}
  </div>

  <div class="divider"></div>

  <table>
    <tr><td><strong>Date:</strong></td><td style="text-align:right;">${report.date}</td></tr>
    <tr><td><strong>Opened:</strong></td><td style="text-align:right;">${fmtDateTime(report.openedAt)}</td></tr>
    <tr><td><strong>Closed:</strong></td><td style="text-align:right;">${fmtDateTime(report.closedAt)}</td></tr>
  </table>

  <div class="divider"></div>

  <div class="section-title">Sales Summary</div>
  <table class="summary-row">
    <tr><td>Total Sales</td><td style="text-align:right;font-weight:700;color:#2ECC71;">${fmt(report.totalSales)}</td></tr>
    <tr><td>Total Refunds</td><td style="text-align:right;font-weight:700;color:#E74C3C;">-${fmt(report.totalRefunds)}</td></tr>
    <tr><td>Total Discounts</td><td style="text-align:right;font-weight:700;color:#F39C12;">-${fmt(report.totalDiscount)}</td></tr>
  </table>
  <div class="divider"></div>
  <table>
    <tr class="total-row"><td>NET SALES</td><td style="text-align:right;">${fmt(report.netSales)}</td></tr>
  </table>
  <table class="summary-row">
    <tr><td>VAT Collected (5%)</td><td style="text-align:right;font-weight:600;">${fmt(report.totalVat)}</td></tr>
    <tr><td>Transactions</td><td style="text-align:right;font-weight:600;">${report.transactionCount}</td></tr>
    <tr><td>Refund Count</td><td style="text-align:right;font-weight:600;">${report.refundCount}</td></tr>
  </table>

  <div class="divider"></div>

  <div class="section-title">Cash Drawer</div>
  <table class="summary-row">
    <tr><td>Opening Cash</td><td style="text-align:right;font-weight:600;">${fmt(report.openingCash)}</td></tr>
    <tr><td>Closing Cash</td><td style="text-align:right;font-weight:600;">${fmt(report.closingCash)}</td></tr>
    <tr><td>Expected Cash</td><td style="text-align:right;font-weight:600;">${fmt(report.totalSales - report.totalRefunds)}</td></tr>
    <tr><td>Difference (${diffLabel})</td><td style="text-align:right;font-weight:700;color:${diffColor};">${fmt(Math.abs(cashDiff))}</td></tr>
  </table>

  ${paymentRows ? `
  <div class="divider"></div>
  <div class="section-title">Payment Breakdown</div>
  <table class="summary-row">${paymentRows}</table>
  ` : ""}

  ${categoryRows ? `
  <div class="divider"></div>
  <div class="section-title">Sales by Category</div>
  <table class="summary-row">${categoryRows}</table>
  ` : ""}

  ${staffRows ? `
  <div class="divider"></div>
  <div class="section-title">Sales by Staff</div>
  <table class="summary-row">${staffRows}</table>
  ` : ""}

  <div class="divider"></div>

  <div class="footer">
    End of Day Report<br/>
    Generated: ${fmtDateTime(Date.now())}<br/>
    This is a system-generated Z-Report<br/>
    <span style="font-size:9px;color:#888;">Powered by Al Salik Computers</span>
  </div>
</body>
</html>`;
}

export function generateCreditPaymentReceiptHTML(
  data: CreditPaymentReceiptData,
  business: BusinessSettings
): string {
  const rd = business.receiptDesign ?? DEFAULT_RECEIPT_DESIGN;
  const fs = getFontSize(rd.fontSize);
  const pw = getPaperWidth(rd.paperWidth);
  const pageSize = rd.paperWidth === "58mm" ? "58mm" : "80mm";

  const trnLine = rd.showTrn && business.trn
    ? `<div>TRN: ${business.trn}</div>` : "";

  const logoMaxW = rd.paperWidth === "58mm" ? 100 : 140;
  const logoSection = rd.showLogo && business.logoBase64
    ? `<div class="center" style="margin-bottom:6px;"><img src="${business.logoBase64}" alt="Logo" style="max-width:${logoMaxW}px;max-height:60px;object-fit:contain;" /></div>`
    : "";

  const invoiceRows = data.invoices.length > 0
    ? data.invoices.map((inv) => `
        <tr>
          <td style="padding:3px 0;text-align:left;">${inv.invoiceNumber}</td>
          <td style="padding:3px 0;text-align:right;font-size:${fs.body - 1}px;color:#666;">${new Date(inv.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
          <td style="padding:3px 0;text-align:right;">${fmt(inv.total)}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;color:#999;">No invoice reference</td></tr>`;

  const noteRow = data.note
    ? `<tr><td style="text-align:left;color:#555;">Ref / Note</td><td style="text-align:right;">${data.note}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @page { margin: 4mm; size: ${pageSize} auto; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Tahoma', 'Arial', 'Segoe UI', sans-serif; font-size: ${fs.body}px; color: #000; width: ${pw}; margin: 0 auto; padding: 4mm 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .ar, [lang="ar"] { font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Arial Unicode MS', sans-serif; direction: rtl; unicode-bidi: embed; color: #000 !important; font-weight: 700; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .header-title { font-size: ${fs.header}px; font-weight: bold; margin-bottom: 2px; }
    .header-ar { font-size: ${fs.title}px; font-weight: bold; margin-bottom: 4px; }
    .info-line { font-size: ${fs.body - 1}px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: ${fs.body - 1}px; font-weight: bold; padding: 4px 0; border-bottom: 1px solid #000; }
    .total-section td { padding: 2px 0; }
    .grand-total td { font-size: ${fs.header + 2}px; font-weight: bold; padding: 6px 0; }
    .paid-banner { background: #27AE60; color: #fff; padding: 4px 0; font-size: ${fs.header}px; font-weight: bold; text-align: center; margin-bottom: 4px; letter-spacing: 1px; }
    .footer { font-size: ${fs.body - 2}px; text-align: center; margin-top: 8px; line-height: 1.5; }
  </style>
</head>
<body>

  <div class="paid-banner">✓ PAYMENT RECEIVED</div>

  ${logoSection}

  <div class="center info-line" style="margin-bottom:4px;">
    ${business.businessName ? `<div class="bold" style="font-size:${fs.title}px;">${business.businessName}</div>` : ""}
    ${trnLine}
    ${business.address ? `<div>${business.address}</div>` : ""}
    ${business.phone ? `<div>Tel: ${business.phone}</div>` : ""}
  </div>

  <div class="divider"></div>

  <div class="center">
    <div class="header-ar">إيصال سداد دين</div>
    <div class="header-title">CREDIT PAYMENT RECEIPT</div>
  </div>

  <div class="divider"></div>

  <table class="info-line">
    <tr><td><strong>Date:</strong></td><td style="text-align:right;">${formatDateTime(data.paidAt)}</td></tr>
    <tr><td><strong>Customer:</strong></td><td style="text-align:right;">${data.customerName}</td></tr>
    ${data.customerPhone ? `<tr><td><strong>Phone:</strong></td><td style="text-align:right;">${data.customerPhone}</td></tr>` : ""}
    <tr><td><strong>Paid Via:</strong></td><td style="text-align:right;font-weight:bold;">${data.paymentMethod}</td></tr>
    ${noteRow}
  </table>

  <div class="divider"></div>

  ${data.invoices.length > 0 ? `
  <div style="font-size:${fs.body - 1}px;font-weight:bold;margin-bottom:4px;">Credit Invoices</div>
  <table>
    <thead><tr>
      <th style="text-align:left;">Invoice #</th>
      <th style="text-align:right;">Date</th>
      <th style="text-align:right;">Amount</th>
    </tr></thead>
    <tbody>${invoiceRows}</tbody>
  </table>
  <div class="divider"></div>
  ` : ""}

  <table class="total-section">
    <tr><td style="text-align:left;">Amount Paid</td><td style="text-align:right;">${fmt(data.amountPaid)}</td></tr>
    <tr><td style="text-align:left;">Remaining Balance</td><td style="text-align:right;">${fmt(data.remainingBalance)}</td></tr>
  </table>

  <div class="divider"></div>

  <table>
    <tr class="grand-total">
      <td style="text-align:left;">AMOUNT PAID</td>
      <td style="text-align:right;">${fmt(data.amountPaid)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <div class="footer">
    ${data.remainingBalance <= 0
      ? "✓ Account fully settled / تم تسوية الحساب بالكامل"
      : `Remaining: ${fmt(data.remainingBalance)}`
    }<br/>
    Thank you for your payment<br/>
    شكراً على الدفع<br/>
    <span style="font-size:9px;color:#888;border-top:1px dashed #ccc;display:inline-block;margin-top:4px;padding-top:4px;">Powered by Al Salik Computers</span>
  </div>
</body>
</html>`;
}
