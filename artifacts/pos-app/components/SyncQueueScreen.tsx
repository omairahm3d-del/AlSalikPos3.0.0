import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDatabase } from "@/context/DatabaseCore";
import type { CatalogOutboxRow, SyncLogEntry, SyncQueueRow } from "@/context/DatabaseCore";
import { useSync } from "@/context/SyncContext";
import { useColors } from "@/hooks/useColors";

type Tab = "queue" | "log";

const KIND_LABEL: Record<string, string> = {
  sale_push: "Sale Push",
  catalog_push: "Catalog Push",
  catalog_pull: "Catalog Pull",
};

const KIND_COLOR: Record<string, string> = {
  sale_push: "#3B82F6",
  catalog_push: "#8B5CF6",
  catalog_pull: "#10B981",
};

function formatTs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ago(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SyncQueueScreen({ onBack }: { onBack: () => void }) {
  const colors = useColors();
  const db = useDatabase();
  const { syncNow, isSyncing, dismissSyncItem, dismissCatalogItem } = useSync();

  const [tab, setTab] = useState<Tab>("queue");
  const [salesQueue, setSalesQueue] = useState<SyncQueueRow[]>([]);
  const [catalogOutbox, setCatalogOutbox] = useState<CatalogOutboxRow[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDismissAll, setConfirmDismissAll] = useState<"sales" | "catalog" | null>(null);
  const [confirmClearLog, setConfirmClearLog] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sq, co, sl] = await Promise.all([
        db.loadSyncQueue(),
        db.loadCatalogOutbox(),
        db.loadSyncLogs(100),
      ]);
      setSalesQueue(sq);
      setCatalogOutbox(co);
      setSyncLogs(sl);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  const handleDismissSale = useCallback(async (queueId: string) => {
    setDismissingId(queueId);
    try {
      await dismissSyncItem(queueId);
      setSalesQueue((prev) => prev.filter((r) => r.queueId !== queueId));
    } finally {
      setDismissingId(null);
    }
  }, [dismissSyncItem]);

  const handleDismissCatalog = useCallback(async (outboxId: string) => {
    setDismissingId(outboxId);
    try {
      await dismissCatalogItem(outboxId);
      setCatalogOutbox((prev) => prev.filter((r) => r.outboxId !== outboxId));
    } finally {
      setDismissingId(null);
    }
  }, [dismissCatalogItem]);

  const handleDismissAllSales = useCallback(async () => {
    setConfirmDismissAll(null);
    for (const row of salesQueue) {
      await dismissSyncItem(row.queueId).catch(() => {});
    }
    setSalesQueue([]);
  }, [salesQueue, dismissSyncItem]);

  const handleDismissAllCatalog = useCallback(async () => {
    setConfirmDismissAll(null);
    for (const row of catalogOutbox) {
      await dismissCatalogItem(row.outboxId).catch(() => {});
    }
    setCatalogOutbox([]);
  }, [catalogOutbox, dismissCatalogItem]);

  const handleClearLog = useCallback(async () => {
    setConfirmClearLog(false);
    await db.clearSyncLogs();
    setSyncLogs([]);
  }, [db]);

  const handleSyncNow = useCallback(async () => {
    await syncNow();
    await load();
  }, [syncNow, load]);

  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
      paddingTop: 16, paddingBottom: 12, gap: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.foreground },
    syncBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "#3B82F6", paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 8,
    },
    syncBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    tabs: {
      flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
    tabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#3B82F6" },
    tabText: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    tabTextActive: { color: "#3B82F6" },
    scroll: { flex: 1 },
    section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    sectionRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    emptyBox: {
      alignItems: "center", justifyContent: "center",
      paddingVertical: 20,
    },
    emptyText: { color: colors.mutedForeground, fontSize: 13 },
    card: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: 10, padding: 12, marginBottom: 8,
    },
    cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    cardMain: { flex: 1 },
    cardLabel: { fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 2 },
    cardMeta: { fontSize: 12, color: colors.mutedForeground, marginBottom: 2 },
    cardError: { fontSize: 12, color: "#EF4444", marginTop: 2 },
    badge: {
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
      alignSelf: "flex-start",
    },
    badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
    dismissBtn: {
      padding: 6, borderRadius: 6,
      backgroundColor: "#EF444420",
    },
    dismissAllBtn: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
      backgroundColor: "#EF444420",
    },
    dismissAllText: { fontSize: 12, fontWeight: "600", color: "#EF4444" },
    confirmRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#EF444415", borderRadius: 8,
      padding: 10, marginBottom: 8,
    },
    confirmText: { flex: 1, fontSize: 12, color: "#EF4444", fontWeight: "600" },
    confirmYes: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
      backgroundColor: "#EF4444",
    },
    confirmYesText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    confirmNo: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
      backgroundColor: colors.border,
    },
    confirmNoText: { fontSize: 12, fontWeight: "600", color: colors.foreground },
    logKindDot: {
      width: 8, height: 8, borderRadius: 4, marginTop: 4,
    },
    logRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    logMain: { flex: 1 },
    logKind: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    logMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
    logError: { fontSize: 12, color: "#EF4444", marginTop: 2 },
    counts: {
      flexDirection: "row", gap: 12, marginTop: 4,
    },
    countItem: { fontSize: 12, color: colors.mutedForeground },
    countGreen: { color: "#10B981" },
    countRed: { color: "#EF4444" },
    clearLogBtn: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
      backgroundColor: "#64748B20",
    },
    clearLogText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    bottomPad: { height: 40 },
  });

  const renderQueue = () => (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Sales queue */}
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Sales ({salesQueue.length})</Text>
          {salesQueue.length > 0 && !confirmDismissAll && (
            <TouchableOpacity style={s.dismissAllBtn} onPress={() => setConfirmDismissAll("sales")}>
              <Text style={s.dismissAllText}>Dismiss All</Text>
            </TouchableOpacity>
          )}
        </View>
        {confirmDismissAll === "sales" && (
          <View style={s.confirmRow}>
            <Text style={s.confirmText}>Remove all {salesQueue.length} pending sale(s) from the queue?</Text>
            <TouchableOpacity style={s.confirmYes} onPress={handleDismissAllSales}>
              <Text style={s.confirmYesText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmNo} onPress={() => setConfirmDismissAll(null)}>
              <Text style={s.confirmNoText}>No</Text>
            </TouchableOpacity>
          </View>
        )}
        {salesQueue.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="check-circle" size={20} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { marginTop: 6 }]}>No pending sales</Text>
          </View>
        ) : (
          salesQueue.map((row) => (
            <View key={row.queueId} style={s.card}>
              <View style={s.cardRow}>
                <View style={s.cardMain}>
                  <Text style={s.cardLabel} numberOfLines={1}>Sale · {row.entityId.slice(0, 12)}…</Text>
                  <Text style={s.cardMeta}>
                    Enqueued {ago(row.enqueuedAt)} · {row.attemptCount} attempt{row.attemptCount !== 1 ? "s" : ""}
                    {row.lastAttemptAt ? ` · last ${ago(row.lastAttemptAt)}` : ""}
                  </Text>
                  {row.lastError && <Text style={s.cardError}>{row.lastError}</Text>}
                </View>
                <TouchableOpacity
                  style={s.dismissBtn}
                  onPress={() => handleDismissSale(row.queueId)}
                  disabled={dismissingId === row.queueId}
                >
                  {dismissingId === row.queueId
                    ? <ActivityIndicator size={14} color="#EF4444" />
                    : <Feather name="x" size={16} color="#EF4444" />}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={s.divider} />

      {/* Catalog outbox */}
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Catalog ({catalogOutbox.length})</Text>
          {catalogOutbox.length > 0 && confirmDismissAll !== "catalog" && (
            <TouchableOpacity style={s.dismissAllBtn} onPress={() => setConfirmDismissAll("catalog")}>
              <Text style={s.dismissAllText}>Dismiss All</Text>
            </TouchableOpacity>
          )}
        </View>
        {confirmDismissAll === "catalog" && (
          <View style={s.confirmRow}>
            <Text style={s.confirmText}>Remove all {catalogOutbox.length} pending catalog item(s)?</Text>
            <TouchableOpacity style={s.confirmYes} onPress={handleDismissAllCatalog}>
              <Text style={s.confirmYesText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmNo} onPress={() => setConfirmDismissAll(null)}>
              <Text style={s.confirmNoText}>No</Text>
            </TouchableOpacity>
          </View>
        )}
        {catalogOutbox.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="check-circle" size={20} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { marginTop: 6 }]}>No pending catalog changes</Text>
          </View>
        ) : (
          catalogOutbox.map((row) => (
            <View key={row.outboxId} style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.badge, { backgroundColor: row.deleted ? "#EF4444" : "#8B5CF6" }]}>
                  <Text style={s.badgeText}>{row.deleted ? "DEL" : row.entityType.toUpperCase().slice(0, 4)}</Text>
                </View>
                <View style={s.cardMain}>
                  <Text style={s.cardLabel} numberOfLines={1}>{row.entityType} · {row.entityId.slice(0, 12)}…</Text>
                  <Text style={s.cardMeta}>
                    Enqueued {ago(row.enqueuedAt)} · {row.attemptCount} attempt{row.attemptCount !== 1 ? "s" : ""}
                    {row.lastAttemptAt ? ` · last ${ago(row.lastAttemptAt)}` : ""}
                  </Text>
                  {row.lastError && <Text style={s.cardError}>{row.lastError}</Text>}
                </View>
                <TouchableOpacity
                  style={s.dismissBtn}
                  onPress={() => handleDismissCatalog(row.outboxId)}
                  disabled={dismissingId === row.outboxId}
                >
                  {dismissingId === row.outboxId
                    ? <ActivityIndicator size={14} color="#EF4444" />
                    : <Feather name="x" size={16} color="#EF4444" />}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={s.bottomPad} />
    </ScrollView>
  );

  const renderLog = () => (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Recent events ({syncLogs.length})</Text>
          {syncLogs.length > 0 && !confirmClearLog && (
            <TouchableOpacity style={s.clearLogBtn} onPress={() => setConfirmClearLog(true)}>
              <Text style={s.clearLogText}>Clear Log</Text>
            </TouchableOpacity>
          )}
        </View>
        {confirmClearLog && (
          <View style={s.confirmRow}>
            <Text style={s.confirmText}>Clear all {syncLogs.length} log entries?</Text>
            <TouchableOpacity style={s.confirmYes} onPress={handleClearLog}>
              <Text style={s.confirmYesText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmNo} onPress={() => setConfirmClearLog(false)}>
              <Text style={s.confirmNoText}>No</Text>
            </TouchableOpacity>
          </View>
        )}
        {syncLogs.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="activity" size={20} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { marginTop: 6 }]}>No sync events recorded yet</Text>
          </View>
        ) : (
          syncLogs.map((entry) => (
            <View key={entry.id} style={s.card}>
              <View style={s.logRow}>
                <View style={[s.logKindDot, { backgroundColor: KIND_COLOR[entry.kind] ?? "#64748B" }]} />
                <View style={s.logMain}>
                  <Text style={s.logKind}>{KIND_LABEL[entry.kind] ?? entry.kind}</Text>
                  <Text style={s.logMeta}>{formatTs(entry.at)}</Text>
                  <View style={s.counts}>
                    <Text style={s.countItem}>Attempted: {entry.attempted}</Text>
                    <Text style={[s.countItem, s.countGreen]}>OK: {entry.succeeded}</Text>
                    {entry.failed > 0 && <Text style={[s.countItem, s.countRed]}>Failed: {entry.failed}</Text>}
                  </View>
                  {entry.error && <Text style={s.logError}>{entry.error}</Text>}
                </View>
              </View>
            </View>
          ))
        )}
      </View>
      <View style={s.bottomPad} />
    </ScrollView>
  );

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Sync Queue</Text>
        {loading
          ? <ActivityIndicator size="small" color="#3B82F6" />
          : (
            <TouchableOpacity style={s.syncBtn} onPress={handleSyncNow} disabled={isSyncing}>
              {isSyncing
                ? <ActivityIndicator size={14} color="#fff" />
                : <Feather name="refresh-cw" size={14} color="#fff" />}
              <Text style={s.syncBtnText}>{isSyncing ? "Syncing…" : "Sync Now"}</Text>
            </TouchableOpacity>
          )}
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tabBtn, tab === "queue" && s.tabBtnActive]}
          onPress={() => setTab("queue")}
        >
          <Text style={[s.tabText, tab === "queue" && s.tabTextActive]}>
            Queue{salesQueue.length + catalogOutbox.length > 0 ? ` (${salesQueue.length + catalogOutbox.length})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === "log" && s.tabBtnActive]}
          onPress={() => { setTab("log"); load(); }}
        >
          <Text style={[s.tabText, tab === "log" && s.tabTextActive]}>
            Log{syncLogs.length > 0 ? ` (${syncLogs.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && tab === "queue" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : tab === "queue" ? renderQueue() : renderLog()}
    </View>
  );
}
