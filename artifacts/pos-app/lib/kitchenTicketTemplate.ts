import type { CartItem, KOTSettings } from "@/types";
import { CURRENCY, DEFAULT_KOT_SETTINGS } from "@/types";

function getFontSize(size: KOTSettings["fontSize"]): { body: number; header: number; item: number } {
  switch (size) {
    case "small": return { body: 12, header: 16, item: 14 };
    case "large": return { body: 16, header: 22, item: 20 };
    default: return { body: 14, header: 18, item: 16 };
  }
}

export function generateKitchenTicketHTML(
  items: CartItem[],
  orderNumber: string,
  tableName?: string,
  staffName?: string,
  kotSettings?: KOTSettings,
  stationFilter?: string
): string {
  const ks = kotSettings ?? DEFAULT_KOT_SETTINGS;
  const fs = getFontSize(ks.fontSize);
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  let filteredItems = items;
  if (stationFilter) {
    filteredItems = items.filter((item) => {
      const cat = item.product.category;
      const station = ks.categoryRouting[cat];
      return station === stationFilter;
    });
  }

  if (filteredItems.length === 0) return "";

  const itemRows = filteredItems
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 0;font-size:${fs.item}px;font-weight:bold;">${item.quantity}x</td>
        <td style="padding:6px 8px;font-size:${fs.item}px;font-weight:bold;">${item.product.name}</td>
        ${ks.showPrice ? `<td style="padding:6px 0;font-size:${fs.body}px;text-align:right;">${CURRENCY} ${(item.product.price * item.quantity).toFixed(2)}</td>` : ""}
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
    body { font-family: 'Courier New', Courier, monospace; font-size: ${fs.body}px; color: #000; width: 72mm; margin: 0 auto; padding: 4mm 0; }
    .divider { border-top: 2px dashed #000; margin: 8px 0; }
    .header { text-align: center; font-size: ${fs.header}px; font-weight: bold; margin-bottom: 4px; }
    .info { font-size: ${fs.body}px; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="header">KITCHEN ORDER</div>
  ${stationFilter ? `<div style="text-align:center;font-size:${fs.body + 2}px;font-weight:bold;margin-bottom:4px;">Station: ${stationFilter}</div>` : ""}
  <div class="divider"></div>
  <div style="text-align:center;">
    <div class="info"><strong>Order:</strong> ${orderNumber}</div>
    ${tableName ? `<div class="info" style="font-size:${fs.item}px;font-weight:bold;">Table: ${tableName}</div>` : ""}
    <div class="info">${date} ${time}</div>
    ${staffName ? `<div class="info">Cashier: ${staffName}</div>` : ""}
  </div>
  <div class="divider"></div>
  <table>${itemRows}</table>
  <div class="divider"></div>
  <div style="text-align:center;font-size:${fs.body - 1}px;margin-top:4px;">
    Total Items: ${filteredItems.reduce((s, i) => s + i.quantity, 0)}
  </div>
</body>
</html>`;
}

export function getUniqueStations(items: CartItem[], kotSettings?: KOTSettings): string[] {
  const ks = kotSettings ?? DEFAULT_KOT_SETTINGS;
  const stations = new Set<string>();
  for (const item of items) {
    const station = ks.categoryRouting[item.product.category];
    if (station) stations.add(station);
  }
  return Array.from(stations);
}
