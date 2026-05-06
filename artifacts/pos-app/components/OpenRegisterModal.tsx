import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import { formatCurrency } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OpenRegisterModal({ visible, onClose, onSuccess }: Props) {
  const colors = useColors();
  const { loadBusinessSettings, saveBusinessSettings } = useDatabase();
  const [floatInput, setFloatInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    loadBusinessSettings().then((biz) => {
      const prefill = biz.lastClosingCash ?? 0;
      setFloatInput(prefill > 0 ? prefill.toFixed(2) : "");
    });
  }, [visible, loadBusinessSettings]);

  const handleOpen = useCallback(async () => {
    const amount = parseFloat(floatInput || "0");
    if (isNaN(amount) || amount < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid opening float (0 or more).");
      return;
    }
    setSaving(true);
    try {
      const biz = await loadBusinessSettings();
      await saveBusinessSettings({
        ...biz,
        registerOpen: true,
        openingFloat: amount,
        openedAt: Date.now(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.();
      onClose();
    } catch {
      Alert.alert("Error", "Could not open the register. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [floatInput, loadBusinessSettings, saveBusinessSettings, onClose, onSuccess]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.sheet, { backgroundColor: colors.card }]}>
          <View style={s.header}>
            <Feather name="unlock" size={22} color={colors.primary} />
            <Text style={[s.title, { color: colors.foreground }]}>Open Register</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[s.label, { color: colors.mutedForeground }]}>
            Opening Float (AED)
          </Text>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>
            Pre-filled from last closing cash. Edit if different.
          </Text>
          <TextInput
            style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
            value={floatInput}
            onChangeText={setFloatInput}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />

          <TouchableOpacity
            style={[s.btn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleOpen}
            disabled={saving}
          >
            <Feather name="unlock" size={16} color="#fff" />
            <Text style={s.btnText}>
              {saving ? "Opening…" : `Open Register${floatInput ? ` · ${formatCurrency(parseFloat(floatInput) || 0)}` : ""}`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    width: "100%", maxWidth: 380,
    borderRadius: 16, padding: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 10 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 10 },
  input: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 18, fontWeight: "700", marginBottom: 20, textAlign: "center",
  },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, borderRadius: 12, gap: 8,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
