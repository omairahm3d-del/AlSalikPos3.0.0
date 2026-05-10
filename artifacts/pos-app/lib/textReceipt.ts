import type { BusinessSettings, ReceiptDesignSettings, Sale, SaleItem, ZReport } from "@/types";
import { CURRENCY, DEFAULT_RECEIPT_DESIGN } from "@/types";

function asciiSafe(s: string): string {
  return (s || "")
    .replace(/[\u0600-\u06FF]/g, "")
    .replace(/[×]/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[é]/g, "e")
    .replace(/[\u0080-\uFFFF]/g, "?")
    .trim();
}

function pad(s: string, n: number): string {
  s = s.length > n ? s.slice(0, n) : s;
  return s + " ".repeat(n - s.length);
}
function padRight(s: string, n: number): string {
  s = s.length > n ? s.slice(s.length - n) : s;
  return " ".repeat(n - s.length) + s;
}
function center(s: string, width: number): string {
  s = s.length > width ? s.slice(0, width) : s;
  const left = Math.floor((width - s.length) / 2);
  return " ".repeat(left) + s;
}

function fmt(amount: number): string {
  return `${CURRENCY} ${Math.abs(amount).toFixed(2)}`;
}

function dateStr(ts: number): string {
  const d = new Date(ts);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function generateReceiptText(
  sale: Sale,
  items: SaleItem[],
  business: BusinessSettings,
  design?: ReceiptDesignSettings,
): string {
  const rd = design ?? business.receiptDesign ?? DEFAULT_RECEIPT_DESIGN;
  const width = rd.paperWidth === "58mm" ? 32 : 48;
  const sep = "-".repeat(width);
  const lines: string[] = [];

  if (business.businessName) lines.push(center(asciiSafe(business.businessName), width));
  if (business.address) lines.push(center(asciiSafe(business.address), width));
  if (business.phone) lines.push(center(`Tel: ${asciiSafe(business.phone)}`, width));
  if (rd.showTrn && business.trn) lines.push(center(`TRN: ${asciiSafe(business.trn)}`, width));
  lines.push(sep);
  lines.push(center(sale.isRefund ? "REFUND RECEIPT" : "TAX INVOICE (SIMPLIFIED)", width));
  lines.push(sep);
  lines.push(`Inv : ${asciiSafe(sale.invoiceNumber || sale.id)}`);
  lines.push(`Date: ${dateStr(sale.createdAt)}`);
  if (sale.staffName) lines.push(`Staff: ${asciiSafe(sale.staffName)}`);
  if (sale.customerName) lines.push(`Cust: ${asciiSafe(sale.customerName)}`);
  if (sale.tableName) lines.push(`Table: ${asciiSafe(sale.tableName)}`);
  if (sale.orderType) lines.push(`Type: ${asciiSafe(String(sale.orderType))}`);
  lines.push(sep);

  const nameWidth = width - 18;
  lines.push(`${pad("Item", nameWidth)} Qty  Price  Total`);
  lines.push(sep);
  for (const it of items) {
    const name = asciiSafe(it.productName);
    const effectivePrice = it.productPrice + (it.modifierTotal ?? 0);
    if (name.length <= nameWidth) {
      lines.push(`${pad(name, nameWidth)} ${padRight(String(Math.abs(it.quantity)), 3)} ${padRight(effectivePrice.toFixed(2), 6)} ${padRight(it.lineTotal.toFixed(2), 6)}`);
    } else {
      lines.push(name);
      lines.push(`${pad("", nameWidth)} ${padRight(String(Math.abs(it.quantity)), 3)} ${padRight(effectivePrice.toFixed(2), 6)} ${padRight(it.lineTotal.toFixed(2), 6)}`);
    }
    if (it.bundleServices && it.bundleServices.length > 0) {
      for (const s of it.bundleServices) {
        lines.push(`  + ${asciiSafe(s.serviceName)}`);
      }
    }
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        const adj = m.priceAdjustment !== 0 ? ` (${m.priceAdjustment > 0 ? "+" : ""}${m.priceAdjustment.toFixed(2)})` : "";
        lines.push(`  > ${asciiSafe(m.optionName)}${adj}`);
      }
    }
    if ((it.discountAmount ?? 0) > 0) {
      lines.push(`  Discount: -${fmt(it.discountAmount!)}`);
    }
  }
  lines.push(sep);

  const moneyRow = (label: string, value: string) =>
    `${pad(label, width - 14)}${padRight(value, 14)}`;

  lines.push(moneyRow("Subtotal", fmt(sale.subtotal)));
  if ((sale.discountAmount ?? 0) > 0) {
    lines.push(moneyRow("Discount", `-${fmt(sale.discountAmount!)}`));
  }
  lines.push(moneyRow(`VAT ${Math.round(sale.vatRate * 100)}%`, fmt(sale.vatAmount)));
  lines.push(sep);
  lines.push(moneyRow("TOTAL", fmt(sale.total)));
  if (sale.paymentMethod === "Cash" && (sale.cashTendered ?? 0) > 0) {
    lines.push(sep);
    lines.push(moneyRow("Cash Tendered", fmt(sale.cashTendered!)));
    lines.push(moneyRow("Change", fmt(sale.changeDue ?? 0)));
  }
  if (sale.customerCreditBalance !== undefined) {
    const prevBal = sale.customerCreditBalance;
    const newBal = prevBal + (sale.paymentMethod === "Credit" ? sale.total : 0);
    lines.push(sep);
    lines.push(moneyRow("Prev Balance", fmt(prevBal)));
    if (sale.paymentMethod === "Credit") {
      lines.push(moneyRow("This Sale (Credit)", `+${fmt(sale.total)}`));
    }
    lines.push(moneyRow("Outstanding Bal", fmt(newBal)));
  }
  lines.push(sep);
  lines.push(`Payment: ${asciiSafe(sale.paymentMethod)}`);
  if (sale.loyaltyPointsEarned) lines.push(`Points earned: ${sale.loyaltyPointsEarned}`);
  if (sale.loyaltyPointsRedeemed) lines.push(`Points redeemed: ${sale.loyaltyPointsRedeemed}`);
  lines.push("");
  lines.push(center(asciiSafe(rd.footerText || "Thank you for your business!"), width));
  if (business.businessName) lines.push(center(`-- ${asciiSafe(business.businessName)} --`, width));
  lines.push("");
  return lines.join("\n");
}

export function generateWhatsAppReceipt(
  sale: Sale,
  items: SaleItem[],
  business: BusinessSettings,
): string {
  const sep = "─────────────────────────────";
  const lines: string[] = [];
  const vatPct = Math.round(sale.vatRate * 100);

  lines.push(sale.isRefund ? "*إشعار استرداد | REFUND RECEIPT*" : "*فاتورة ضريبية مبسطة | SIMPLIFIED TAX INVOICE*");
  lines.push("");
  if (business.businessName) lines.push(`*${business.businessName}*`);
  if (business.trn) lines.push(`TRN: ${business.trn}`);
  if (business.address) lines.push(business.address);
  if (business.phone) lines.push(`Tel: ${business.phone}`);
  lines.push("");
  lines.push(sep);
  if (sale.invoiceNumber) lines.push(`Invoice #: ${sale.invoiceNumber}`);
  lines.push(`Date: ${dateStr(sale.createdAt)}`);
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`);
  if (sale.staffName) lines.push(`Served by: ${sale.staffName}`);
  if (sale.tableName) lines.push(`Table: ${sale.tableName}`);
  lines.push(`Payment: ${sale.paymentMethod}`);
  lines.push(sep);
  lines.push("*Items:*");
  for (const it of items) {
    const qty = Math.abs(it.quantity);
    const line = `• ${it.productName} × ${qty}${qty > 1 ? "" : ""}  — ${CURRENCY} ${it.lineTotal.toFixed(2)}`;
    lines.push(line);
    if ((it.discountAmount ?? 0) > 0) {
      lines.push(`  _(Discount: -${CURRENCY} ${it.discountAmount!.toFixed(2)})_`);
    }
  }
  lines.push(sep);
  lines.push(`Subtotal (excl. VAT):  ${CURRENCY} ${sale.subtotal.toFixed(2)}`);
  if ((sale.discountAmount ?? 0) > 0) {
    lines.push(`Discount:             -${CURRENCY} ${sale.discountAmount!.toFixed(2)}`);
  }
  lines.push(`VAT (${vatPct}%):               ${CURRENCY} ${sale.vatAmount.toFixed(2)}`);
  lines.push(sep);
  lines.push(`*TOTAL (incl. VAT):    ${CURRENCY} ${sale.total.toFixed(2)}*`);
  if (sale.loyaltyPointsEarned) lines.push(`🌟 Points earned: ${sale.loyaltyPointsEarned}`);
  lines.push(sep);
  lines.push("شكراً لتعاملكم معنا  |  Thank you for your business!");
  return lines.join("\n");
}

export function formatWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length <= 10) return `971${digits.slice(1)}`;
  return digits;
}

export function generateZReportText(report: ZReport, business: BusinessSettings, paperWidth: "58mm" | "80mm" = "80mm"): string {
  const width = paperWidth === "58mm" ? 32 : 48;
  const sep = "-".repeat(width);
  const lines: string[] = [];
  lines.push(center(asciiSafe(business.businessName || "POS"), width));
  lines.push(center("Z-REPORT (END OF DAY)", width));
  lines.push(sep);
  lines.push(`Date: ${report.date}`);
  lines.push(`Open: ${dateStr(report.openedAt)}`);
  lines.push(`Close: ${dateStr(report.closedAt)}`);
  lines.push(sep);
  const row = (label: string, value: string) => `${pad(label, width - 14)}${padRight(value, 14)}`;
  lines.push(row("Opening Cash", fmt(report.openingCash)));
  lines.push(row("Closing Cash", fmt(report.closingCash)));
  lines.push(sep);
  lines.push(row("Total Sales", fmt(report.totalSales)));
  lines.push(row("Total Refunds", fmt(report.totalRefunds)));
  lines.push(row("Net Sales", fmt(report.netSales)));
  lines.push(row("VAT Collected", fmt(report.totalVat)));
  lines.push(row("Discounts", fmt(report.totalDiscount)));
  lines.push(sep);
  lines.push(row("Transactions", String(report.transactionCount)));
  lines.push(row("Refunds", String(report.refundCount)));
  lines.push("");
  lines.push(center("End of Z-Report", width));
  lines.push("");
  return lines.join("\n");
}
