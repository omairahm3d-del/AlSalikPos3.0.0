import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import type { Expense } from "@/types";
import { CURRENCY, formatCurrency } from "@/types";

function todayRange(): { from: number; to: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return { from: d.getTime(), to: d.getTime() + 86_400_000 };
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadExpenses, createExpense, deleteExpense } = useDatabase();
  const { currentStaff } = useStaff();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = todayRange();
      setExpenses(await loadExpenses(from, to));
    } finally {
      setLoading(false);
    }
  }, [loadExpenses]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = useCallback(async () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Enter a positive amount.");
      return;
    }
    if (!noteInput.trim()) {
      Alert.alert("Note Required", "Please enter a description for this expense.");
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        amount,
        note: noteInput.trim(),
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAmountInput("");
      setNoteInput("");
      setShowAdd(false);
      await load();
    } catch {
      Alert.alert("Error", "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }, [amountInput, noteInput, createExpense, currentStaff, load]);

  const handleDelete = useCallback((expense: Expense) => {
    Alert.alert(
      "Delete Expense",
      `Delete "${expense.note}" (${formatCurrency(expense.amount)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            await deleteExpense(expense.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await load();
          },
        },
      ]
    );
  }, [deleteExpense, load]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? insets.top + 8 : insets.top }]}>
      <View style={[s.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>Cash-Out / Expenses</Text>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[s.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {total > 0 && (
        <View style={[s.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.totalLabel, { color: colors.mutedForeground }]}>Total Today</Text>
          <Text style={[s.totalAmount, { color: colors.destructive }]}>-{formatCurrency(total)}</Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <Text style={{ color: colors.mutedForeground }}>Loading…</Text>
        </View>
      ) : expenses.length === 0 ? (
        <View style={s.center}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No expenses recorded today</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <View style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.rowLeft}>
                <Text style={[s.rowNote, { color: colors.foreground }]}>{item.note}</Text>
                <Text style={[s.rowMeta, { color: colors.mutedForeground }]}>
                  {fmtTime(item.createdAt)}{item.staffName ? ` · ${item.staffName}` : ""}
                </Text>
              </View>
              <Text style={[s.rowAmt, { color: colors.destructive }]}>
                -{CURRENCY} {item.amount.toFixed(2)}
              </Text>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 10 }}
              >
                <Feather name="trash-2" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} transparent animationType="fade">
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>Record Expense</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Amount ({CURRENCY})</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="e.g. Paid milkman, Office supplies…"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.destructive, opacity: saving ? 0.6 : 1 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              <Feather name="minus-circle" size={16} color="#fff" />
              <Text style={s.saveBtnText}>{saving ? "Saving…" : "Record Cash-Out"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, gap: 12,
  },
  title: { flex: 1, fontSize: 17, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, gap: 6 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  totalCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    margin: 16, padding: 16, borderRadius: 12, borderWidth: 1,
  },
  totalLabel: { fontSize: 14, fontWeight: "600" },
  totalAmount: { fontSize: 20, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 14,
    borderRadius: 12, borderWidth: 1,
  },
  rowLeft: { flex: 1 },
  rowNote: { fontSize: 14, fontWeight: "600" },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { width: "100%", maxWidth: 380, borderRadius: 16, padding: 24 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 16 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, gap: 8 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
