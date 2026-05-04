import type { CartItem } from "@/types";

export function generateKitchenTicketHTML(
  items: CartItem[],
  orderNumber: string,
  tableName?: string,
  staffName?: string
): string {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 0;font-size:16px;font-weight:bold;">${item.quantity}x</td>
        <td style="padding:6px 8px;font-size:16px;font-weight:bold;">${item.product.name}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { margin: 4mm; size: 80mm auto; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #000; width: 72mm; margin: 0 auto; padding: 4mm 0; }
    .divider { border-top: 2px dashed #000; margin: 8px 0; }
    .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .info { font-size: 12px; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="header">KITCHEN ORDER</div>
  <div class="divider"></div>
  <div style="text-align:center;">
    <div class="info"><strong>Order:</strong> ${orderNumber}</div>
    ${tableName ? `<div class="info" style="font-size:16px;font-weight:bold;">Table: ${tableName}</div>` : ""}
    <div class="info">${date} ${time}</div>
    ${staffName ? `<div class="info">Cashier: ${staffName}</div>` : ""}
  </div>
  <div class="divider"></div>
  <table>${itemRows}</table>
  <div class="divider"></div>
  <div style="text-align:center;font-size:11px;margin-top:4px;">
    Total Items: ${items.reduce((s, i) => s + i.quantity, 0)}
  </div>
</body>
</html>`;
}
