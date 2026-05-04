import type { BusinessSettings, CartItem, OrderType } from "@/types";
import { VAT_RATE, formatCurrency } from "@/types";

export function generateBillHTML(
  items: CartItem[],
  options: {
    businessSettings?: BusinessSettings | null;
    orderType?: OrderType;
    tableName?: string;
    staffName?: string;
    subtotal: number;
    vatAmount: number;
    total: number;
    itemDiscountTotal?: number;
  }
): string {
  const { businessSettings, orderType, tableName, staffName, subtotal, vatAmount, total, itemDiscountTotal } = options;
  const bizName = businessSettings?.businessName || "Restaurant";
  const trn = businessSettings?.trn || "";
  const address = businessSettings?.address || "";
  const phone = businessSettings?.phone || "";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });

  const itemsHTML = items.map((item) => {
    const lineTotal = item.product.price * item.quantity - (item.discountAmount ?? 0);
    return `<tr>
      <td style="padding:4px 0">${item.product.name}</td>
      <td style="text-align:center;padding:4px 0">${item.quantity}</td>
      <td style="text-align:right;padding:4px 0">${formatCurrency(item.product.price)}</td>
      <td style="text-align:right;padding:4px 0">${formatCurrency(lineTotal)}</td>
    </tr>${item.discountAmount && item.discountAmount > 0 ? `<tr><td colspan="4" style="color:#2ECC71;font-size:11px;padding:0 0 4px 8px">Discount: -${formatCurrency(item.discountAmount)}</td></tr>` : ""}`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:monospace;max-width:320px;margin:0 auto;padding:16px;color:#333;font-size:13px}
  h2{text-align:center;margin:0 0 4px}
  .info{text-align:center;font-size:11px;color:#666;margin:2px 0}
  .sep{border-top:1px dashed #999;margin:10px 0}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;padding:4px 0;border-bottom:1px solid #ccc;font-size:12px}
  .totals td{padding:3px 0;font-size:13px}
  .grand{font-weight:bold;font-size:15px;border-top:2px solid #333;padding-top:6px!important}
  .footer{text-align:center;margin-top:12px;font-size:11px;color:#888}
  .badge{display:inline-block;background:#4F8EF7;color:#fff;padding:2px 10px;border-radius:4px;font-size:11px;margin:4px 0}
</style></head><body>
  <h2>${bizName}</h2>
  ${address ? `<p class="info">${address}</p>` : ""}
  ${phone ? `<p class="info">Tel: ${phone}</p>` : ""}
  ${trn ? `<p class="info">TRN: ${trn}</p>` : ""}
  <div class="sep"></div>
  <p style="margin:4px 0"><strong>BILL PREVIEW</strong></p>
  <p style="margin:2px 0;font-size:11px">${dateStr} ${timeStr}</p>
  ${orderType ? `<p style="margin:2px 0"><span class="badge">${orderType.charAt(0).toUpperCase() + orderType.slice(1)}</span></p>` : ""}
  ${tableName ? `<p style="margin:2px 0;font-size:12px">Table: <strong>${tableName}</strong></p>` : ""}
  ${staffName ? `<p style="margin:2px 0;font-size:11px;color:#666">Staff: ${staffName}</p>` : ""}
  <div class="sep"></div>
  <table>
    <tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
    ${itemsHTML}
  </table>
  <div class="sep"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(subtotal)}</td></tr>
    ${(itemDiscountTotal ?? 0) > 0 ? `<tr><td style="color:#2ECC71">Discounts</td><td style="text-align:right;color:#2ECC71">-${formatCurrency(itemDiscountTotal ?? 0)}</td></tr>` : ""}
    <tr><td>VAT${vatAmount > 0 && subtotal > 0 ? ` (${((vatAmount / (subtotal - (itemDiscountTotal ?? 0))) * 100).toFixed(0)}%)` : ""}</td><td style="text-align:right">${formatCurrency(vatAmount)}</td></tr>
    <tr class="grand"><td>TOTAL</td><td style="text-align:right">${formatCurrency(total)}</td></tr>
  </table>
  <div class="sep"></div>
  <p class="footer">** Bill Preview - Not a Tax Invoice **</p>
</body></html>`;
}
