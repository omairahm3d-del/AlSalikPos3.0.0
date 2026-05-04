import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";
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
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [loyaltyPointsPerAed, setLoyaltyPointsPerAed] = useState("1");
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState("0.01");
  const [existingSettings, setExistingSettings] = useState<BusinessSettings | null>(null);

  const load = useCallback(async () => {
    const s = await loadBusinessSettings();
    setExistingSettings(s);
    setBusinessName(s.businessName);
    setTrn(s.trn);
    setAddress(s.address);
    setPhone(s.phone);
    setEmail(s.email);
    setLogoBase64(s.logoBase64);
    setLoyaltyPointsPerAed(String(s.loyaltyPointsPerAed ?? 1));
    setLoyaltyRedemptionRate(String(s.loyaltyRedemptionRate ?? 0.01));
  }, [loadBusinessSettings]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleSave = async () => {
    const trimmedTrn = trn.trim();
    if (trimmedTrn && !/^\d{15}$/.test(trimmedTrn)) {
      Alert.alert("Invalid TRN", "UAE Tax Registration Number must be exactly 15 digits.");
      return;
    }
    const settings: BusinessSettings = {
      ...existingSettings,
      businessName: businessName.trim(),
      trn: trimmedTrn,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      logoBase64,
      loyaltyPointsPerAed: parseFloat(loyaltyPointsPerAed) || 1,
      loyaltyRedemptionRate: parseFloat(loyaltyRedemptionRate) || 0.01,
    };
    await saveBusinessSettings(settings);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  const pickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow photo library access to upload a logo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled) {
        const asset = result.assets?.[0];
        if (asset?.base64) {
          const mime = asset.mimeType && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(asset.mimeType)
            ? asset.mimeType
            : "image/jpeg";
          setLogoBase64(`data:${mime};base64,${asset.base64}`);
        } else {
          Alert.alert("Logo Error", "Could not read the selected image. Please try a different file.");
        }
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const removeLogo = () => {
    Alert.alert("Remove Logo", "Are you sure you want to remove the business logo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => setLogoBase64(undefined) },
    ]);
  };

  const renderField = (
    label: string, value: string, onChange: (v: string) => void,
    placeholder: string, hint?: string, keyboardType?: "default" | "phone-pad" | "email-address" | "decimal-pad"
  ) => (
    <>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {hint && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground} keyboardType={keyboardType}
        style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
      />
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Business Settings</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.notice, { backgroundColor: colors.primary + "15", borderRadius: colors.radius }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.primary }]}>Configure your business details for UAE VAT-compliant tax invoices and receipts.</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Business Logo</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Appears on receipts when "Show Logo" is enabled in Receipt Designer</Text>
          <View style={styles.logoRow}>
            {logoBase64 ? (
              <View style={styles.logoPreviewWrap}>
                <Image source={{ uri: logoBase64 }} style={[styles.logoPreview, { borderColor: colors.border, borderRadius: colors.radius }]} />
                <View style={styles.logoBtnRow}>
                  <TouchableOpacity onPress={pickLogo} style={[styles.logoBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={[styles.logoBtnText, { color: colors.primary }]}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={removeLogo} style={[styles.logoBtn, { backgroundColor: "#E74C3C15", borderColor: "#E74C3C40", borderRadius: colors.radius }]}>
                    <Feather name="trash-2" size={14} color="#E74C3C" />
                    <Text style={[styles.logoBtnText, { color: "#E74C3C" }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={pickLogo} style={[styles.logoPlaceholder, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Feather name="image" size={28} color={colors.mutedForeground} />
                <Text style={[styles.logoPlaceholderText, { color: colors.mutedForeground }]}>Tap to upload logo</Text>
              </TouchableOpacity>
            )}
          </View>

          {renderField("Business Name", businessName, setBusinessName, "e.g. Al Baraka Cafe LLC")}
          {renderField("TRN (Tax Registration Number)", trn, setTrn, "e.g. 100123456700003", "15-digit UAE Tax Registration Number issued by FTA")}
          {renderField("Address", address, setAddress, "e.g. Shop 5, Al Wahda Mall, Abu Dhabi")}
          {renderField("Phone", phone, setPhone, "e.g. +971 2 123 4567", undefined, "phone-pad")}
          {renderField("Email", email, setEmail, "e.g. info@albaraka.ae", undefined, "email-address")}

          <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]} />

          <View style={[styles.notice, { backgroundColor: "#F39C12" + "15", borderRadius: colors.radius }]}>
            <Feather name="star" size={14} color="#F39C12" />
            <Text style={[styles.noticeText, { color: "#F39C12" }]}>Configure how customers earn and redeem loyalty points.</Text>
          </View>

          {renderField("Points Earned per AED Spent", loyaltyPointsPerAed, setLoyaltyPointsPerAed, "1", "e.g. 1 = earn 1 point for every AED 1 spent", "decimal-pad")}
          {renderField("Point Redemption Value (AED)", loyaltyRedemptionRate, setLoyaltyRedemptionRate, "0.01", "e.g. 0.01 = each point is worth AED 0.01", "decimal-pad")}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  form: { padding: 20, paddingBottom: 60 },
  notice: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10, marginBottom: 10 },
  noticeText: { fontSize: 13, lineHeight: 18, flex: 1 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 20 },
  hint: { fontSize: 11, marginBottom: 6, marginTop: -4 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  sectionDivider: { borderBottomWidth: 1, marginVertical: 20 },
  logoRow: { marginTop: 4 },
  logoPreviewWrap: { alignItems: "center", gap: 10 },
  logoPreview: { width: 80, height: 80, borderWidth: 1, resizeMode: "contain" },
  logoBtnRow: { flexDirection: "row", gap: 10 },
  logoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  logoBtnText: { fontSize: 13, fontWeight: "600" },
  logoPlaceholder: { alignItems: "center", justifyContent: "center", paddingVertical: 24, borderWidth: 1, borderStyle: "dashed", gap: 6 },
  logoPlaceholderText: { fontSize: 13 },
});
