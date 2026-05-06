import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSync } from "@/context/SyncContext";

/**
 * Tiny floating indicator showing the cloud sync state. Visible whenever
 * there is pending work, an active sync, or a recent error so the operator
 * always knows whether their sales have left the device. Hidden once the
 * queue drains and stays hidden.
 */
export function SyncStatusPill() {
  const { pendingCount, isSyncing, lastError, syncNow } = useSync();

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
      Alert.alert(
        "Sync details",
        lastError,
        [
          { text: "Close", style: "cancel" },
          { text: "Retry now", onPress: () => { syncNow().catch(() => {}); } },
        ],
      );
      return;
    }
    syncNow().catch(() => {});
  };

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: color }]}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
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
});
