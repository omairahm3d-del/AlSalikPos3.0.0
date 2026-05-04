import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { BusinessSettings } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function BusinessSettingsModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadBusinessSettings, saveBusinessSettings } = useDatabase();

  const [businessName, setBusinessName] = useState("");
  const [trn, setTrn] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const s = await loadBusinessSettings();
    setBusinessName(s.businessName);
    setTrn(s.trn);
    setAddress(s.address);
    setPhone(s.phone);
    setEmail(s.email);
  }, [loadBusinessSettings]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleSave = async () => {
    const trimmedTrn = trn.trim();
    if (trimmedTrn && !/^\d{15}$/.test(trimmedTrn)) {
      Alert.alert(
        "Invalid TRN",
        "UAE Tax Registration Number must be exactly 15 digits. Leave empty if you don't have one yet."
      );
      return;
    }
    const settings: BusinessSettings = {
      businessName: businessName.trim(),
      trn: trimmedTrn,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };
    await saveBusinessSettings(settings);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  const renderField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    hint?: string,
    keyboardType?: "default" | "phone-pad" | "email-address"
  ) => (
    <>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {hint && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        style={[
          styles.input,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            color: colors.foreground,
            borderRadius: colors.radius,
          },
        ]}
      />
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 16, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Business Settings</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.notice, { backgroundColor: colors.primary + "15", borderRadius: colors.radius }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.primary }]}>
              Configure your business details for UAE VAT-compliant tax invoices and receipts.
            </Text>
          </View>

          {renderField(
            "Business Name",
            businessName,
            setBusinessName,
            "e.g. Al Baraka Café LLC"
          )}
          {renderField(
            "TRN (Tax Registration Number)",
            trn,
            setTrn,
            "e.g. 100123456700003",
            "15-digit UAE Tax Registration Number issued by FTA"
          )}
          {renderField(
            "Address",
            address,
            setAddress,
            "e.g. Shop 5, Al Wahda Mall, Abu Dhabi"
          )}
          {renderField(
            "Phone",
            phone,
            setPhone,
            "e.g. +971 2 123 4567",
            undefined,
            "phone-pad"
          )}
          {renderField(
            "Email",
            email,
            setEmail,
            "e.g. info@albaraka.ae",
            undefined,
            "email-address"
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  form: { padding: 20, paddingBottom: 60 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 20,
  },
  hint: {
    fontSize: 11,
    marginBottom: 6,
    marginTop: -4,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
  },
});
