import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseCore";
import type { BusinessSettings } from "@/types";

const WIDE = 820;

function getGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "back"],
];

export function LockScreen() {
  const colors = useColors();
  const { login } = useStaff();
  const db = useDatabase();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;

  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biz, setBiz] = useState<BusinessSettings | null>(null);
  const [now, setNow] = useState(new Date());

  const shake = useRef(new Animated.Value(0)).current;
  const dotScales = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;

  useEffect(() => { db.loadBusinessSettings().then(setBiz).catch(() => {}); }, [db]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  const bumpDot = (idx: number) => {
    Animated.sequence([
      Animated.timing(dotScales[idx], { toValue: 1.4, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(dotScales[idx], { toValue: 1.0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const handlePress = async (digit: string) => {
    if (loading) return;
    setError(false);
    const newPin = pin + digit;
    bumpDot(Math.min(newPin.length - 1, 3));
    setPin(newPin);
    if (newPin.length >= 4) {
      setLoading(true);
      const ok = await login(newPin);
      if (!ok) {
        setError(true);
        setPin("");
        if (Platform.OS !== "web") Vibration.vibrate(200);
      }
      setLoading(false);
    }
  };

  const handleBackspace = () => { setError(false); setPin((p) => p.slice(0, -1)); };

  const businessName = biz?.businessName?.trim() || "Al Salik POS";
  const logo = biz?.logoBase64;
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });

  /* ─── Left brand panel ──────────────────────────────────────── */
  const brandPanel = (
    <View style={s.brandPanel}>
      <View style={s.brandTop}>
        <View style={s.clockBox}>
          <Text style={s.timeText}>{fmtTime(now)}</Text>
          <Text style={s.dateText}>{fmtDate(now)}</Text>
        </View>

        <View style={s.logoWrap}>
          {logo && Platform.OS === "web" ? (
            <View style={s.logoImageWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 16 }} />
            </View>
          ) : (
            <LinearGradient colors={["#7C73FF", "#5448E0"]} style={s.brandLogo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="shopping-bag" size={30} color="#fff" />
            </LinearGradient>
          )}
        </View>
        <Text style={s.brandName}>{businessName}</Text>
        <Text style={s.brandSub}>by Al Salik Computers</Text>

        <Text style={s.greeting}>{getGreeting(now)}</Text>
      </View>

      <Text style={s.brandFooter}>Al Salik POS · Powered by Al Salik Computers</Text>
    </View>
  );

  /* ─── Right PIN panel ───────────────────────────────────────── */
  const pinPanel = (
    <View style={s.pinPanel}>
      <Text style={s.pinTitle}>Staff Login</Text>
      <Text style={[s.pinSubtitle, error && s.pinSubtitleError]}>
        {error ? "Incorrect PIN — try again" : "Enter your 4-digit PIN"}
      </Text>
      <Text style={s.pinHint}>Default admin · PIN 1234</Text>

      <Animated.View style={[s.dotsRow, { transform: [{ translateX: shakeX }] }]}>
        {[0, 1, 2, 3].map((i) => {
          const filled = i < pin.length;
          return (
            <Animated.View
              key={i}
              style={[
                s.dot,
                {
                  backgroundColor: filled ? (error ? "#FF5C5C" : "#6C63FF") : "rgba(255,255,255,0.12)",
                  borderColor: filled ? "transparent" : "rgba(255,255,255,0.20)",
                  transform: [{ scale: dotScales[i] }],
                  shadowColor: filled ? "#6C63FF" : "transparent",
                  shadowOpacity: filled ? 0.7 : 0,
                  shadowRadius: 10,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      <View style={s.keypad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={s.keyRow}>
            {row.map((key) => {
              if (key === "") return <View key="empty" style={s.key} />;
              if (key === "back") {
                return (
                  <TouchableOpacity key="back" style={s.key} onPress={handleBackspace} activeOpacity={0.6}>
                    <Feather name="delete" size={24} color="rgba(255,255,255,0.75)" />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.key, s.keyFilled]}
                  onPress={() => handlePress(key)}
                  activeOpacity={0.55}
                >
                  <Text style={s.keyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#1A1B3A", "#0F1117", "#0F1117"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={[s.glow, { backgroundColor: "#6C63FF" }]} pointerEvents="none" />
      <View style={[s.glow2, { backgroundColor: "#4F8EF7" }]} pointerEvents="none" />

      {isWide ? (
        /* ── Wide: brand left | PIN right ─────────────────────── */
        <View style={s.wide}>
          {brandPanel}
          <View style={s.divider} />
          {pinPanel}
        </View>
      ) : (
        /* ── Narrow: stacked, PIN below brand ─────────────────── */
        <View style={s.narrow}>
          <View style={s.narrowTop}>
            <Text style={s.timeText}>{fmtTime(now)}</Text>
            <Text style={s.dateTextNarrow}>{fmtDate(now)}</Text>

            <View style={s.logoWrapNarrow}>
              {logo && Platform.OS === "web" ? (
                <View style={s.logoImageWrap}>
                  <img src={logo} alt="" style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 12 }} />
                </View>
              ) : (
                <LinearGradient colors={["#7C73FF", "#5448E0"]} style={s.brandLogoSm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Feather name="shopping-bag" size={24} color="#fff" />
                </LinearGradient>
              )}
            </View>
            <Text style={s.brandNameSm}>{businessName}</Text>
          </View>

          <View style={s.narrowPin}>
            <Text style={s.pinTitle}>Staff Login</Text>
            <Text style={[s.pinSubtitle, error && s.pinSubtitleError]}>
              {error ? "Incorrect PIN — try again" : "Enter your 4-digit PIN"}
            </Text>
            <Text style={s.pinHint}>Default admin · PIN 1234</Text>

            <Animated.View style={[s.dotsRow, { transform: [{ translateX: shakeX }] }]}>
              {[0, 1, 2, 3].map((i) => {
                const filled = i < pin.length;
                return (
                  <Animated.View
                    key={i}
                    style={[
                      s.dot,
                      {
                        backgroundColor: filled ? (error ? "#FF5C5C" : "#6C63FF") : "rgba(255,255,255,0.12)",
                        borderColor: filled ? "transparent" : "rgba(255,255,255,0.20)",
                        transform: [{ scale: dotScales[i] }],
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>

            <View style={s.keypad}>
              {KEYS.map((row, ri) => (
                <View key={ri} style={s.keyRow}>
                  {row.map((key) => {
                    if (key === "") return <View key="empty" style={s.key} />;
                    if (key === "back") {
                      return (
                        <TouchableOpacity key="back" style={s.key} onPress={handleBackspace} activeOpacity={0.6}>
                          <Feather name="delete" size={22} color="rgba(255,255,255,0.75)" />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity key={key} style={[s.key, s.keyFilled]} onPress={() => handlePress(key)} activeOpacity={0.55}>
                        <Text style={s.keyText}>{key}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          <Text style={s.narrowFooter}>Al Salik POS · Al Salik Computers</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  glow: { position: "absolute", top: -120, left: -120, width: 320, height: 320, borderRadius: 160, opacity: 0.18 },
  glow2: { position: "absolute", bottom: -160, right: -120, width: 380, height: 380, borderRadius: 190, opacity: 0.15 },

  /* ── Wide layout ── */
  wide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },
  divider: { width: 1, backgroundColor: "rgba(255,255,255,0.07)" },

  brandPanel: {
    flex: 1,
    paddingHorizontal: 48,
    paddingVertical: 40,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandTop: { gap: 0 },
  clockBox: { marginBottom: 40 },
  timeText: { color: "#fff", fontSize: 48, fontWeight: "300", fontFamily: "Inter_400Regular", letterSpacing: 1 },
  dateText: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 4, fontFamily: "Inter_500Medium" },

  logoWrap: {
    padding: 6,
    borderRadius: 24,
    backgroundColor: "rgba(108,99,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(108,99,255,0.28)",
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  logoImageWrap: { width: 72, height: 72, borderRadius: 16, overflow: "hidden", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  brandLogo: { width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  brandName: { color: "#fff", fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.3, marginBottom: 4 },
  brandSub: { color: "#8A82FF", fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 24 },
  greeting: { color: "rgba(255,255,255,0.50)", fontSize: 15, fontFamily: "Inter_500Medium" },
  brandFooter: { color: "rgba(255,255,255,0.30)", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },

  pinPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  pinTitle: { color: "#fff", fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  pinSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 4, textAlign: "center" },
  pinSubtitleError: { color: "#FF8585" },
  pinHint: { color: "#8A82FF", fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textAlign: "center", marginBottom: 28, opacity: 0.85 },

  dotsRow: { flexDirection: "row", gap: 20, marginBottom: 36 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },

  keypad: { gap: 16 },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: 20 },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  keyFilled: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  keyText: { fontSize: 28, fontWeight: "500", color: "#fff", fontFamily: "Inter_500Medium" },

  /* ── Narrow layout ── */
  narrow: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  narrowTop: { alignItems: "center", gap: 0 },
  dateTextNarrow: { color: "rgba(255,255,255,0.50)", fontSize: 12, marginTop: 2, fontFamily: "Inter_500Medium", marginBottom: 20 },
  logoWrapNarrow: {
    padding: 5,
    borderRadius: 20,
    backgroundColor: "rgba(108,99,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(108,99,255,0.28)",
    marginBottom: 10,
  },
  brandLogoSm: { width: 60, height: 60, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  brandNameSm: { color: "#fff", fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", textAlign: "center" },

  narrowPin: { alignItems: "center", width: "100%" },
  narrowFooter: { color: "rgba(255,255,255,0.30)", fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
});
