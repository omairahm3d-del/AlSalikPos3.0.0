import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useDatabase } from "@/context/DatabaseCore";
import { useLicense } from "@/context/LicenseContext";
import { useWorkMode } from "@/context/WorkModeContext";
import { HeldOrder, KdsStatus, OrderType } from "@/types";

const STATUS_COLORS: Record<Exclude<KdsStatus, "bumped">, string> = {
  new: "#F39C12",
  preparing: "#4F8EF7",
  ready: "#2ECC71",
};

const STATUS_LABELS: Record<Exclude<KdsStatus, "bumped">, string> = {
  new: "NEW",
  preparing: "PREPARING",
  ready: "READY",
};

type FilterType = "all" | Exclude<KdsStatus, "bumped">;

function formatElapsed(createdAt: number): string {
  const totalSecs = Math.floor((Date.now() - createdAt) / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function timerColor(createdAt: number): string {
  const mins = (Date.now() - createdAt) / 60000;
  if (mins > 20) return "#E74C3C";
  if (mins > 10) return "#F39C12";
  return "#2ECC71";
}

interface OrderCardProps {
  order: HeldOrder;
  onAction: (id: string, next: KdsStatus) => void;
  tick: number;
}

function OrderCard({ order, onAction, tick }: OrderCardProps) {
  const status = (order.kdsStatus ?? "new") as Exclude<KdsStatus, "bumped">;
  const color = STATUS_COLORS[status];
  const elapsed = formatElapsed(order.createdAt);
  const tColor = timerColor(order.createdAt);

  const nextAction =
    status === "new"
      ? { label: "Start Preparing", icon: "play" as const, next: "preparing" as KdsStatus }
      : status === "preparing"
      ? { label: "Mark Ready", icon: "check" as const, next: "ready" as KdsStatus }
      : { label: "Bump (Done)", icon: "check-circle" as const, next: "bumped" as KdsStatus };

  const bumpColor = "#2ECC71";
  const btnColor = nextAction.next === "bumped" ? bumpColor : color;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.tableName}>{order.tableName}</Text>
          <View style={styles.orderTypePill}>
            <Text style={styles.orderTypeText}>{order.orderType.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={[styles.timer, { color: tColor }]}>{elapsed}</Text>
          <View style={[styles.statusBadge, { backgroundColor: color + "22", borderColor: color }]}>
            <Text style={[styles.statusBadgeText, { color }]}>{STATUS_LABELS[status]}</Text>
          </View>
        </View>
      </View>

      {order.staffName ? (
        <Text style={styles.metaText}>
          <Feather name="user" size={11} color="#666" /> {order.staffName}
        </Text>
      ) : null}
      {order.customerName ? (
        <Text style={styles.metaText}>
          <Feather name="tag" size={11} color="#666" /> {order.customerName}
        </Text>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.itemsList}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={[styles.itemDot, { backgroundColor: item.colorHex || "#4F8EF7" }]} />
            <Text style={styles.itemQty}>×{item.quantity}</Text>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.productName}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          { borderColor: btnColor, backgroundColor: btnColor + (pressed ? "33" : "18") },
        ]}
        onPress={() => onAction(order.id, nextAction.next)}
      >
        <Feather name={nextAction.icon} size={15} color={btnColor} />
        <Text style={[styles.actionBtnText, { color: btnColor }]}>{nextAction.label}</Text>
      </Pressable>
    </View>
  );
}

function serverRowToHeldOrder(row: Record<string, unknown>): HeldOrder {
  return {
    id: row.clientId as string,
    tableId: "",
    tableName: row.tableName as string,
    orderType: row.orderType as OrderType,
    staffName: (row.staffName as string) ?? undefined,
    customerName: (row.customerName as string) ?? undefined,
    kdsStatus: (row.kdsStatus as KdsStatus) ?? "new",
    items: (row.items as HeldOrder["items"]) ?? [],
    createdAt: new Date(row.clientCreatedAt as string).getTime(),
    updatedAt: new Date(row.updatedAt as string).getTime(),
  };
}

export default function KdsScreen() {
  const { loadHeldOrders, updateKdsStatus } = useDatabase();
  const { isSaloon } = useWorkMode();
  const { session } = useLicense();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<HeldOrder[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [tick, setTick] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Pending KDS status updates that haven't confirmed to the server yet.
   * Key = clientId, value = KdsStatus. Retried on every poll cycle until
   * the server acknowledges them (or the order disappears).
   */
  const pendingKdsUpdates = useRef<Record<string, KdsStatus>>({});

  const isOnline = session?.license?.licenseType === "online";

  const refresh = useCallback(async () => {
    if (isOnline && session?.token) {
      try {
        const { authedFetch } = await import("@/lib/saasApi");

        // --- Fix #3: catch-up push ---
        // Push any local held orders that the server doesn't know about yet.
        // This recovers from the "fire-and-forget POST failed on hold" scenario.
        const localOrders = await loadHeldOrders();
        const localActive = localOrders.filter(
          (o) => (o.kdsStatus ?? "new") !== "bumped",
        );

        // Fetch from server
        const resp = await authedFetch("/api/pos/held-orders", session.token);
        if (resp.ok) {
          const data = (await resp.json()) as {
            heldOrders: Record<string, unknown>[];
          };
          const serverIds = new Set(
            data.heldOrders.map((r) => r.clientId as string),
          );

          // Push local orders missing from the server (best-effort, parallel)
          const missing = localActive.filter((o) => !serverIds.has(o.id));
          if (missing.length > 0) {
            await Promise.allSettled(
              missing.map((o) =>
                authedFetch("/api/pos/held-orders", session.token!, {
                  method: "POST",
                  body: JSON.stringify({
                    clientId: o.id,
                    tableName: o.tableName,
                    orderType: o.orderType,
                    staffName: o.staffName ?? null,
                    customerName: o.customerName ?? null,
                    kdsStatus: o.kdsStatus ?? "new",
                    items: o.items,
                    clientCreatedAt: o.createdAt,
                  }),
                }),
              ),
            );
          }

          // --- Fix #4: retry pending KDS status updates ---
          const pending = { ...pendingKdsUpdates.current };
          const retryEntries = Object.entries(pending);
          if (retryEntries.length > 0) {
            const results = await Promise.allSettled(
              retryEntries.map(([clientId, status]) =>
                authedFetch(
                  `/api/pos/held-orders/${encodeURIComponent(clientId)}/kds-status`,
                  session.token!,
                  { method: "PATCH", body: JSON.stringify({ kdsStatus: status }) },
                ),
              ),
            );
            // Clear only those that succeeded
            results.forEach((result, i) => {
              const entry = retryEntries[i];
              if (!entry) return;
              const [clientId] = entry;
              if (result.status === "fulfilled" && result.value.ok) {
                delete pendingKdsUpdates.current[clientId];
              }
            });
          }

          // Re-fetch to get server-authoritative list (includes just-pushed orders)
          const resp2 = await authedFetch("/api/pos/held-orders", session.token);
          const data2 = resp2.ok
            ? ((await resp2.json()) as { heldOrders: Record<string, unknown>[] })
            : data;

          const serverOrders = data2.heldOrders
            .map(serverRowToHeldOrder)
            .filter((o) => (o.kdsStatus ?? "new") !== "bumped")
            .sort((a, b) => a.createdAt - b.createdAt);
          setOrders(serverOrders);
          setLastRefreshed(new Date());
          return;
        }
      } catch {
        // Network error — fall through to local DB
      }
    }
    const all = await loadHeldOrders();
    const pending = all
      .filter((o: HeldOrder) => (o.kdsStatus ?? "new") !== "bumped")
      .sort((a: HeldOrder, b: HeldOrder) => a.createdAt - b.createdAt);
    setOrders(pending);
    setLastRefreshed(new Date());
  }, [loadHeldOrders, isOnline, session?.token]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      pollRef.current = setInterval(refresh, 5000);
      timerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [refresh])
  );

  const handleAction = useCallback(
    async (id: string, next: KdsStatus) => {
      // Update locally first for instant UI feedback
      await updateKdsStatus(id, next);
      if (isOnline && session?.token) {
        try {
          const { authedFetch } = await import("@/lib/saasApi");
          const res = await authedFetch(
            `/api/pos/held-orders/${encodeURIComponent(id)}/kds-status`,
            session.token,
            { method: "PATCH", body: JSON.stringify({ kdsStatus: next }) },
          );
          if (!res.ok) {
            // Server rejected — queue for retry on next poll
            pendingKdsUpdates.current[id] = next;
          } else {
            // Confirmed — remove from pending retry queue if present
            delete pendingKdsUpdates.current[id];
          }
        } catch {
          // Network error — queue for retry on next poll
          pendingKdsUpdates.current[id] = next;
        }
      }
      await refresh();
    },
    [updateKdsStatus, refresh, isOnline, session?.token]
  );

  const numCols = width >= 700 ? 2 : 1;

  const countOf = (s: Exclude<KdsStatus, "bumped">) =>
    orders.filter((o) => (o.kdsStatus ?? "new") === s).length;

  const displayed =
    filter === "all" ? orders : orders.filter((o) => (o.kdsStatus ?? "new") === filter);

  if (isSaloon) {
    return (
      <View style={styles.container}>
        <View style={styles.unavailable}>
          <Feather name="monitor" size={40} color="#444" />
          <Text style={styles.unavailableTitle}>KDS not available</Text>
          <Text style={styles.unavailableSubtitle}>
            Kitchen Display System is only active in Restaurant mode.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <Feather name="monitor" size={18} color="#4F8EF7" />
          <Text style={styles.headerTitle}>Kitchen Display</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerTime}>
            {lastRefreshed.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </Text>
          <Pressable style={styles.refreshBtn} onPress={refresh}>
            <Feather name="refresh-cw" size={15} color="#4F8EF7" />
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        {(["new", "preparing", "ready"] as const).map((s) => (
          <View key={s} style={[styles.statCard, { borderLeftColor: STATUS_COLORS[s] }]}>
            <Text style={[styles.statCount, { color: STATUS_COLORS[s] }]}>{countOf(s)}</Text>
            <Text style={styles.statLabel}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
        <View style={[styles.statCard, { borderLeftColor: "#555" }]}>
          <Text style={[styles.statCount, { color: "#CCC" }]}>{orders.length}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {(["all", "new", "preparing", "ready"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === "all" ? "All Orders" : STATUS_LABELS[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {displayed.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={52} color="#2ECC71" />
          <Text style={styles.emptyTitle}>Kitchen is clear</Text>
          <Text style={styles.emptySubtitle}>
            {filter === "all"
              ? "No pending orders. Waiting for new tickets."
              : `No orders with status "${filter === "new" ? "New" : filter === "preparing" ? "Preparing" : "Ready"}".`}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`cols-${numCols}`}
          data={displayed}
          keyExtractor={(item) => item.id}
          numColumns={numCols}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={numCols > 1 ? styles.columnWrapper : undefined}
          renderItem={({ item }) => (
            <View style={numCols > 1 ? styles.cardWrapperCol : styles.cardWrapperFull}>
              <OrderCard order={item} onAction={handleAction} tick={tick} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#1A1D25",
    borderBottomWidth: 1,
    borderBottomColor: "#252830",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTime: {
    fontSize: 12,
    color: "#666",
    fontVariant: ["tabular-nums"],
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#4F8EF715",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1D25",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    alignItems: "center",
  },
  statCount: {
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 9,
    color: "#666",
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  filterBar: {
    flexGrow: 0,
    marginTop: 10,
  },
  filterBarContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1A1D25",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  filterChipActive: {
    backgroundColor: "#4F8EF718",
    borderColor: "#4F8EF7",
  },
  filterChipText: {
    fontSize: 13,
    color: "#777",
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#4F8EF7",
  },
  grid: {
    padding: 12,
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: 12,
  },
  cardWrapperCol: {
    flex: 1,
    marginBottom: 12,
  },
  cardWrapperFull: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#1A1D25",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "#252830",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 5,
  },
  tableName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 24,
  },
  orderTypePill: {
    alignSelf: "flex-start",
    backgroundColor: "#252830",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  orderTypeText: {
    fontSize: 10,
    color: "#888",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardHeaderRight: {
    alignItems: "flex-end",
    gap: 5,
    marginLeft: 8,
  },
  timer: {
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metaText: {
    fontSize: 11,
    color: "#666",
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#252830",
    marginVertical: 10,
  },
  itemsList: {
    gap: 7,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemQty: {
    fontSize: 14,
    color: "#4F8EF7",
    fontWeight: "700",
    minWidth: 28,
    fontVariant: ["tabular-nums"],
  },
  itemName: {
    fontSize: 14,
    color: "#DDD",
    flex: 1,
    lineHeight: 19,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  unavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  unavailableTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#555",
  },
  unavailableSubtitle: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 20,
  },
});
