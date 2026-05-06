import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSync } from "@/context/SyncContext";

/**
 * Tiny floating indicator showing the cloud sync state. Visible whenever
 * there is pending work, an active sync, or a recent error so the operator
 * always knows whether their sales have left the device. Hidden once the
 * queue drains and stays hidden.
 */
export function SyncStatusPill() {
  const { pendingCount, isSyncing, lastError, syncNow, adoptLocalDataForCurrentLicense } = useSync();
  const [expanded, setExpanded] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const canAdopt = !!lastError && lastError.includes("no tenant stamp");

  if (pendingCount === 0 && !isSyncing && !lastError) return null;

  let label: string;
  let color: string;
  if (isSyncing) {
    label = pendingCount > 0 ? `Syncing ${pendingCount}…` : "Syncing…";
    color = "#3B82F6";
  } else if (lastError && pendingCount > 0) {
    label = `Sync paused · ${pendingCount} pending`;
    color = "#F59E0B";
  } else if (pendingCount > 0) {
    label = `${pendingCount} to sync`;
    color = "#64748B";
  } else {
    label = "Sync error";
    color = "#EF4444";
  }

  const onPress = () => {
    if (lastError) {
      setExpanded((v) => !v);
      return;
    }
    syncNow().catch(() => {});
  };

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: color }]}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
      {expanded && lastError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Sync error</Text>
          <Text style={styles.errorBody} selectable>{lastError}</Text>
          <View style={styles.errorActions}>
            {canAdopt ? (
              <Pressable
                disabled={adopting}
                onPress={async () => {
                  setAdopting(true);
                  try {
                    const r = await adoptLocalDataForCurrentLicense();
                    if (r.ok) setExpanded(false);
                  } finally {
                    setAdopting(false);
                  }
                }}
                style={[styles.errorBtn, { backgroundColor: "#10B981", opacity: adopting ? 0.6 : 1 }]}
              >
                <Text style={styles.errorBtnText}>{adopting ? "Adopting…" : "Adopt sales"}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => { syncNow().catch(() => {}); }}
              style={[styles.errorBtn, { backgroundColor: "#3B82F6" }]}
            >
              <Text style={styles.errorBtnText}>Retry now</Text>
            </Pressable>
            <Pressable
              onPress={() => setExpanded(false)}
              style={[styles.errorBtn, { backgroundColor: "#475569" }]}
            >
              <Text style={styles.errorBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 12,
    right: 12,
    zIndex: 1000,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  errorCard: {
    position: "absolute",
    bottom: 36,
    right: 0,
    width: 320,
    maxWidth: 360,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  errorTitle: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  errorBody: {
    color: "white",
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  errorActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  errorBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  errorBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
