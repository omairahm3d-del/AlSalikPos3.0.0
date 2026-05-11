/**
 * Client-side helpers for syncing laundry orders with the cloud server.
 *
 * All functions are fire-and-forget friendly — callers should not await them
 * when they don't want to block the UI.  Network errors are swallowed so an
 * offline device degrades gracefully to local-only mode.
 */

import type { LaundryOrder, LaundryOrderStatus } from "@/types";
import { authedFetch } from "@/lib/saasApi";

function orderToPayload(order: LaundryOrder) {
  return {
    clientId: order.id,
    ticketNumber: order.ticketNumber,
    customerId: order.customerId || null,
    customerName: order.customerName,
    customerPhone: order.customerPhone || null,
    orderType: order.orderType,
    status: order.status,
    promisedAt: order.promisedAt,
    notes: order.notes ?? null,
    subtotal: order.subtotal,
    vatAmount: order.vatAmount,
    total: order.total,
    saleId: order.saleId ?? null,
    paidAt: order.paidAt ?? null,
    paymentMethod: order.paymentMethod ?? null,
    staffId: order.staffId ?? null,
    staffName: order.staffName ?? null,
    items: order.items,
    clientCreatedAt: order.createdAt,
  };
}

/** Push a full laundry order to the server (create or update). */
export async function pushLaundryOrder(
  token: string,
  order: LaundryOrder,
): Promise<void> {
  try {
    await authedFetch("/api/pos/laundry/orders", token, {
      method: "POST",
      body: JSON.stringify(orderToPayload(order)),
    });
  } catch {
    // offline or server error — local data is the fallback
  }
}

/** Push a status change to the server. */
export async function pushLaundryStatus(
  token: string,
  clientId: string,
  status: LaundryOrderStatus,
  extras?: {
    saleId?: string | null;
    paidAt?: number | null;
    paymentMethod?: string | null;
  },
): Promise<void> {
  try {
    await authedFetch(
      `/api/pos/laundry/orders/${encodeURIComponent(clientId)}/status`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ status, ...extras }),
      },
    );
  } catch {
    // offline or server error — fall back to local state
  }
}

/** Pull all laundry orders for this device's branch from the server.
 *  Returns null if the request fails (offline / auth error). */
export async function pullLaundryOrders(
  token: string,
): Promise<LaundryOrder[] | null> {
  try {
    const res = await authedFetch("/api/pos/laundry/orders", token, {
      method: "GET",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.orders as LaundryOrder[]) ?? null;
  } catch {
    return null;
  }
}
