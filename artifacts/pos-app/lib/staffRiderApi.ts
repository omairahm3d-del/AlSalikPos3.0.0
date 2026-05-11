/**
 * Client-side helpers for syncing staff and rider lists with the cloud server.
 * All push calls are fire-and-forget. Pull calls return null on failure (offline).
 */

import type { Rider, Staff } from "@/types";
import { authedFetch } from "@/lib/saasApi";

// ---- Staff ----

export async function pushStaff(token: string, staff: Staff): Promise<void> {
  try {
    await authedFetch("/api/pos/staff", token, {
      method: "POST",
      body: JSON.stringify({
        clientId: staff.id,
        name: staff.name,
        role: staff.role,
        pin: staff.pin,
        active: staff.active,
        isDeleted: false,
        clientCreatedAt: staff.createdAt,
      }),
    });
  } catch {
    // offline — local data is the fallback
  }
}

export async function pullStaff(token: string): Promise<Staff[] | null> {
  try {
    const res = await authedFetch("/api/pos/staff", token);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.staff as Staff[]) ?? null;
  } catch {
    return null;
  }
}

// ---- Riders ----

export async function pushRider(token: string, rider: Rider): Promise<void> {
  try {
    await authedFetch("/api/pos/riders", token, {
      method: "POST",
      body: JSON.stringify({
        clientId: rider.id,
        name: rider.name,
        phone: rider.phone,
        vehicleInfo: rider.vehicleInfo,
        active: rider.active,
        commissionPct: rider.commissionPct ?? 0,
        isDeleted: false,
        clientCreatedAt: rider.createdAt,
      }),
    });
  } catch {
    // offline — local data is the fallback
  }
}

export async function pullRiders(token: string): Promise<Rider[] | null> {
  try {
    const res = await authedFetch("/api/pos/riders", token);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.riders as Rider[]) ?? null;
  } catch {
    return null;
  }
}
