import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLicense } from "@/context/LicenseContext";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/lib/saasApi";

export function ActivationScreen() {
  const colors = useColors();
  const { activate } = useLicense();
  const [licenseKey, setLicenseKey] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = getApiBase();

  const onSubmit = async () => {
    if (submitting) return;
    setError(null);
    if (licenseKey.trim().length < 4) {
      setError("Please enter your license key.");
      return;
    }
    setSubmitting(true);
    try {
      await activate(licenseKey, deviceName);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(prettyError(err.code, err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#1A1B3A", "#0F1117", "#0F1117"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.glow, { backgroundColor: "#6C63FF" }]} />
      <View style={[styles.glow2, { backgroundColor: "#4F8EF7" }]} />

      <View style={styles.content}>
        <View style={styles.brandWrap}>
          <LinearGradient
            colors={["#7C73FF", "#5448E0"]}
            style={styles.brandLogo}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="key" size={28} color="#fff" />
          </LinearGradient>
          <Text style={[styles.brandName, { color: colors.foreground }]}>
            Activate Al Salik POS
          </Text>
          <Text style={[styles.brandSub, { color: "#8A82FF" }]}>
            by Al Salik Computers
          </Text>
        </View>

        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Enter the license key your provider gave you to start using this device.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            License key
          </Text>
          <TextInput
            value={licenseKey}
            onChangeText={(t) => setLicenseKey(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="ALSK-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[styles.input, styles.inputMono, { color: colors.foreground }]}
            editable={!submitting}
            onSubmitEditing={onSubmit}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Device name <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            value={deviceName}
            onChangeText={setDeviceName}
            autoCapitalize="words"
            placeholder="e.g. Front Counter"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[styles.input, { color: colors.foreground }]}
            editable={!submitting}
            onSubmitEditing={onSubmit}
            blurOnSubmit={false}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color="#FF8585" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={onSubmit}
          activeOpacity={0.85}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
        >
          <LinearGradient
            colors={["#7C73FF", "#5448E0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitInner}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitText}>Activate</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          {Platform.OS === "web"
            ? "An internet connection is required for activation."
            : "Make sure this device is online before tapping Activate."}
        </Text>
        {apiBase ? (
          <Text style={styles.serverText}>{apiBase}</Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          Al Salik POS · Powered by Al Salik Computers
        </Text>
      </View>
    </View>
  );
}

function prettyError(code?: string, fallback?: string): string {
  switch (code) {
    case "license_not_found":
      return "That license key isn't recognized. Double-check the characters and try again.";
    case "license_revoked":
      return "This license has been revoked. Please contact your provider.";
    case "license_expired":
      return "This license has expired. Please contact your provider to renew.";
    case "company_suspended":
      return "Your account is suspended. Please contact your provider.";
    case "device_limit_reached":
      return "All device slots on this license are in use. Ask your provider to free a slot or upgrade the license.";
    case "validation_error":
      return "The license key looks invalid. Make sure you copied it exactly.";
    case "network_unreachable":
    case "network_error":
      return "Couldn't reach the server. Check your internet connection and try again.";
    default:
      return fallback || "Activation failed. Please try again.";
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    overflow: "hidden",
    paddingTop: 80,
    paddingBottom: 60,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.18,
  },
  glow2: {
    position: "absolute",
    bottom: -160,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    opacity: 0.15,
  },
  content: { width: "100%", maxWidth: 380, paddingHorizontal: 24, alignItems: "stretch" },
  brandWrap: { alignItems: "center", marginBottom: 24 },
  brandLogo: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  brandName: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  brandSub: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 19,
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  optional: { textTransform: "none", fontWeight: "400" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  inputMono: {
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      default: "Inter_500Medium",
    }) as string,
    letterSpacing: 1.5,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255, 92, 92, 0.10)",
    borderColor: "rgba(255, 92, 92, 0.35)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: { color: "#FFB4B4", fontSize: 12, flex: 1, lineHeight: 16 },
  submitBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  helpText: { fontSize: 11, textAlign: "center", marginTop: 16, opacity: 0.7 },
  serverText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      default: "Inter_400Regular",
    }) as string,
  },
  footer: { position: "absolute", bottom: 18, alignItems: "center" },
  footerText: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3, opacity: 0.7 },
});
