import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLicense } from "@/context/LicenseContext";
import { useColors } from "@/hooks/useColors";
import { getApiBase, type ValidatedBranch } from "@/lib/saasApi";

/**
 * Two-column on wide viewports (≥ 900 px web / desktop / tablet landscape):
 *   ┌─────────────────────┬─────────────────────┐
 *   │  Brand panel        │  Activation form    │
 *   │  – logo, headline   │  – license key      │
 *   │  – value props      │  – device name      │
 *   │  – server hint      │  – Activate button  │
 *   └─────────────────────┴─────────────────────┘
 * Single-column on phones / narrow tablets so nothing overlaps or hides
 * behind the keyboard.
 */
const WIDE_BREAKPOINT = 900;

const VALUE_PROPS: { icon: keyof typeof Feather.glyphMap; title: string; sub: string }[] = [
  { icon: "wifi-off", title: "Offline-first selling", sub: "Keep ringing up sales even when the internet drops." },
  { icon: "shield", title: "UAE tax compliant", sub: "Built-in 5% VAT, FTA-style invoices and Z-Reports." },
  { icon: "git-branch", title: "Multi-branch ready", sub: "Each device pinned to its branch — no mix-ups." },
];

export function ActivationScreen() {
  const colors = useColors();
  const { activate } = useLicense();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [licenseKey, setLicenseKey] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchOptions, setBranchOptions] = useState<ValidatedBranch[] | null>(null);

  const apiBase = getApiBase();

  const tryActivate = async (branchId?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await activate(licenseKey, deviceName, branchId);
      if (res.kind === "needs_branch_selection") setBranchOptions(res.branches);
      else setBranchOptions(null);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(prettyError(err.code, err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setError(null);
    if (licenseKey.trim().length < 4) {
      setError("Please enter your license key.");
      return;
    }
    await tryActivate();
  };

  const onPickBranch = async (branchId: string) => {
    if (submitting) return;
    await tryActivate(branchId);
  };

  const onCancelBranchPick = () => {
    setBranchOptions(null);
    setError(null);
  };

  /* ─── Form panel (right column on wide, full width on mobile) ─────── */
  const formPanel = (
    <View style={[styles.formCard, isWide && styles.formCardWide]}>
      {!isWide ? (
        <View style={styles.brandWrapMobile}>
          <LinearGradient
            colors={["#7C73FF", "#5448E0"]}
            style={styles.brandLogo}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="key" size={26} color="#fff" />
          </LinearGradient>
          <Text style={[styles.brandName, { color: colors.foreground }]}>Activate Al Salik POS</Text>
          <Text style={styles.brandSub}>by Al Salik Computers</Text>
        </View>
      ) : (
        <Text style={[styles.formTitle, { color: colors.foreground }]}>
          {branchOptions ? "Pick a branch" : "Activate this device"}
        </Text>
      )}

      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {branchOptions
          ? "This account has multiple branches. Choose the one this device belongs to."
          : "Enter the license key your provider gave you to start using this device."}
      </Text>

      {branchOptions ? (
        <View style={styles.branchList}>
          {branchOptions.map((b) => (
            <TouchableOpacity
              key={b.id}
              onPress={() => onPickBranch(b.id)}
              disabled={submitting}
              activeOpacity={0.85}
              style={[styles.branchCard, submitting && { opacity: 0.6 }]}
            >
              <Feather name="map-pin" size={16} color="#8A82FF" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.branchName, { color: colors.foreground }]}>{b.name}</Text>
                {b.address ? <Text style={styles.branchAddr}>{b.address}</Text> : null}
              </View>
              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.45)" />
            </TouchableOpacity>
          ))}
          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#FF8585" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={onCancelBranchPick} disabled={submitting} style={styles.linkBtn}>
            <Text style={styles.linkText}>Use a different license</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>License key</Text>
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
        </>
      )}

      <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
        {Platform.OS === "web"
          ? "An internet connection is required for activation."
          : "Make sure this device is online before tapping Activate."}
      </Text>
      {apiBase && !isWide ? <Text style={styles.serverText}>{apiBase}</Text> : null}
    </View>
  );

  /* ─── Brand panel (left column on wide only) ──────────────────────── */
  const brandPanel = (
    <View style={styles.brandPanel}>
      <View>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={["#7C73FF", "#5448E0"]}
            style={styles.brandLogoSm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="key" size={20} color="#fff" />
          </LinearGradient>
          <Text style={styles.brandWord}>Al Salik POS</Text>
        </View>
        <Text style={styles.heroTitle}>
          A modern POS{"\n"}built for the UAE.
        </Text>
        <Text style={styles.heroSub}>
          Activate this device once and start ringing up sales — online or off,
          on the counter or on the road.
        </Text>

        <View style={styles.propsList}>
          {VALUE_PROPS.map((p) => (
            <View key={p.title} style={styles.propRow}>
              <View style={styles.propIcon}>
                <Feather name={p.icon} size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propTitle}>{p.title}</Text>
                <Text style={styles.propSub}>{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View>
        <Text style={styles.brandFooter}>Powered by Al Salik Computers</Text>
        {apiBase ? <Text style={styles.brandServer}>{apiBase}</Text> : null}
      </View>
    </View>
  );

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

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isWide ? styles.scrollWide : styles.scrollNarrow,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {isWide ? (
          <View style={styles.shell}>
            {brandPanel}
            <View style={styles.divider} />
            {formPanel}
          </View>
        ) : (
          formPanel
        )}

        {!isWide ? (
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Al Salik POS · Powered by Al Salik Computers
          </Text>
        ) : null}
      </ScrollView>
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
  root: { flex: 1, overflow: "hidden" },
  glow: {
    position: "absolute", top: -120, left: -120,
    width: 320, height: 320, borderRadius: 160, opacity: 0.18,
  },
  glow2: {
    position: "absolute", bottom: -160, right: -120,
    width: 380, height: 380, borderRadius: 190, opacity: 0.15,
  },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  scrollNarrow: { paddingTop: 60, paddingBottom: 60, paddingHorizontal: 24 },
  scrollWide: { padding: 40 },

  /* Wide split-pane shell */
  shell: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    width: "100%",
    maxWidth: 980,
    minHeight: 540,
  },
  divider: { width: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  /* Brand panel (left) */
  brandPanel: { flex: 1.05, padding: 40, justifyContent: "space-between", gap: 32 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  brandLogoSm: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  brandWord: {
    color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: "#fff", fontSize: 30, lineHeight: 36, fontWeight: "700",
    fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 12,
  },
  heroSub: {
    color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 20, marginBottom: 28,
  },
  propsList: { gap: 16 },
  propRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  propIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(124,115,255,0.20)",
    borderWidth: 1, borderColor: "rgba(124,115,255,0.35)",
    alignItems: "center", justifyContent: "center",
  },
  propTitle: {
    color: "#fff", fontSize: 13, fontWeight: "600",
    fontFamily: "Inter_600SemiBold", marginBottom: 2,
  },
  propSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16 },
  brandFooter: {
    color: "rgba(255,255,255,0.50)", fontSize: 11,
    fontFamily: "Inter_500Medium", letterSpacing: 0.3,
  },
  brandServer: {
    color: "rgba(255,255,255,0.30)", fontSize: 10, marginTop: 4,
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      default: "Inter_400Regular",
    }) as string,
  },

  /* Form panel (right on wide; full on mobile) */
  formCard: { width: "100%", maxWidth: 380, alignSelf: "center" },
  formCardWide: {
    flex: 1, maxWidth: undefined,
    padding: 48, justifyContent: "center",
  },
  formTitle: {
    fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold",
    marginBottom: 6, letterSpacing: 0.2,
  },
  brandWrapMobile: { alignItems: "center", marginBottom: 24 },
  brandLogo: {
    width: 60, height: 60, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  brandName: {
    fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold",
    letterSpacing: 0.4, textAlign: "center",
  },
  brandSub: {
    color: "#8A82FF", fontSize: 11, fontWeight: "600",
    fontFamily: "Inter_600SemiBold", marginTop: 4,
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  subtitle: { fontSize: 13, marginBottom: 22, lineHeight: 19 },

  field: { marginBottom: 14 },
  label: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 6,
    letterSpacing: 0.6, textTransform: "uppercase",
  },
  optional: { textTransform: "none", fontWeight: "400" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_500Medium",
  },
  inputMono: {
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      default: "Inter_500Medium",
    }) as string,
    letterSpacing: 1.5,
  },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(255, 92, 92, 0.10)",
    borderColor: "rgba(255, 92, 92, 0.35)", borderWidth: 1,
    borderRadius: 10, padding: 10, marginBottom: 14,
  },
  errorText: { color: "#FFB4B4", fontSize: 12, flex: 1, lineHeight: 16 },
  submitBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  submitInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  helpText: { fontSize: 11, textAlign: "center", marginTop: 16, opacity: 0.7 },
  serverText: {
    color: "rgba(255,255,255,0.35)", fontSize: 10, textAlign: "center", marginTop: 4,
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      default: "Inter_400Regular",
    }) as string,
  },

  branchList: { gap: 10, marginBottom: 8 },
  branchCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14,
  },
  branchName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  branchAddr: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  linkBtn: { alignSelf: "center", paddingVertical: 8, marginTop: 4 },
  linkText: {
    color: "#8A82FF", fontSize: 12, fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  footerText: {
    fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3,
    opacity: 0.7, marginTop: 24, textAlign: "center",
  },
});
