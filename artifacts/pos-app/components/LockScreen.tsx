import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Vibration } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseCore";
import type { BusinessSettings } from "@/types";

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
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function LockScreen() {
  const colors = useColors();
  const { login } = useStaff();
  const db = useDatabase();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biz, setBiz] = useState<BusinessSettings | null>(null);
  const [now, setNow] = useState(new Date());

  const shake = useRef(new Animated.Value(0)).current;
  const dotScales = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;

  useEffect(() => {
    db.loadBusinessSettings().then(setBiz).catch(() => {});
  }, [db]);

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

  const handleBackspace = () => {
    setError(false);
    setPin((p) => p.slice(0, -1));
  };

  const dots = [0, 1, 2, 3];
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "back"],
  ];

  const businessName = biz?.businessName?.trim() || "Al Salik POS";
  const logo = biz?.logoBase64;
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#1A1B3A", "#0F1117", "#0F1117"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.glow, { backgroundColor: "#6C63FF" }]} pointerEvents="none" />
      <View style={[styles.glow2, { backgroundColor: "#4F8EF7" }]} pointerEvents="none" />

      {/*
        Real flex column (header → scrollable content → footer) instead of
        absolute-positioned chrome. The previous layout placed topBar/footer
        with `position: absolute` and reserved space with paddingTop/Bottom —
        on short or laptop-sized viewports the keypad and brand block
        overlapped the clock and footer. A flex column with the middle area
        scrollable guarantees nothing overlaps regardless of height.
      */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar} pointerEvents="none">
          <Text style={[styles.timeText, { color: colors.foreground }]}>{fmtTime(now)}</Text>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{fmtDate(now)}</Text>
        </View>

        <View style={styles.content}>
        <View style={styles.brandWrap}>
          <View style={styles.logoWrap}>
            {logo ? (
              <View style={styles.logoImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {Platform.OS === "web" ? (
                  <img src={logo} alt="" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 14 }} />
                ) : (
                  <View style={[styles.brandLogo, { backgroundColor: "#6C63FF" }]}>
                    <Feather name="shopping-bag" size={28} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <LinearGradient
                colors={["#7C73FF", "#5448E0"]}
                style={styles.brandLogo}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Feather name="shopping-bag" size={28} color="#fff" />
              </LinearGradient>
            )}
          </View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>{businessName}</Text>
          <Text style={[styles.brandSub, { color: "#8A82FF" }]}>by Al Salik Computers</Text>
        </View>

        <Text style={[styles.greeting, { color: colors.mutedForeground }]}>{getGreeting(now)}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Staff Login</Text>
        <Text style={[styles.subtitle, { color: error ? colors.destructive : colors.mutedForeground }]}>
          {error ? "Incorrect PIN. Try again." : "Enter your 4-digit PIN to continue"}
        </Text>
        <Text style={[styles.hint, { color: "#8A82FF" }]}>
          Default admin · PIN 1234
        </Text>

        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}>
          {dots.map((i) => {
            const filled = i < pin.length;
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: filled
                      ? (error ? colors.destructive : "#6C63FF")
                      : "rgba(255,255,255,0.12)",
                    borderColor: filled ? "transparent" : "rgba(255,255,255,0.18)",
                    transform: [{ scale: dotScales[i] }],
                    shadowColor: filled ? "#6C63FF" : "transparent",
                    shadowOpacity: filled ? 0.6 : 0,
                    shadowRadius: 8,
                  },
                ]}
              />
            );
          })}
        </Animated.View>

        <View style={styles.keypad}>
          {keys.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key) => {
                if (key === "") return <View key="empty" style={styles.key} />;
                if (key === "back") {
                  return (
                    <TouchableOpacity key="back" style={styles.key} onPress={handleBackspace} activeOpacity={0.6}>
                      <Feather name="delete" size={22} color={colors.foreground} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.key, styles.keyFilled]}
                    onPress={() => handlePress(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Al Salik POS · Powered by Al Salik Computers
          </Text>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  scroll: { flex: 1 },
  scrollContent: {
    minHeight: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  glow: {
    position: "absolute",
    top: -120, left: -120,
    width: 320, height: 320,
    borderRadius: 160,
    opacity: 0.18,
  },
  glow2: {
    position: "absolute",
    bottom: -160, right: -120,
    width: 380, height: 380,
    borderRadius: 190,
    opacity: 0.15,
  },
  topBar: {
    alignItems: "center",
    marginBottom: 24,
  },
  timeText: { fontSize: 32, fontWeight: "300", fontFamily: "Inter_400Regular", letterSpacing: 1 },
  dateText: { fontSize: 13, marginTop: 2, fontFamily: "Inter_500Medium" },

  content: { alignItems: "center", width: "100%", maxWidth: 340, paddingHorizontal: 24 },
  brandWrap: { alignItems: "center", marginBottom: 22 },
  logoWrap: {
    padding: 6,
    borderRadius: 22,
    backgroundColor: "rgba(108,99,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(108,99,255,0.28)",
    marginBottom: 14,
  },
  logoImageWrap: { width: 64, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#fff" },
  brandLogo: {
    width: 64, height: 64, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  brandName: { fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  brandSub: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold", marginTop: 4, letterSpacing: 1.2, textTransform: "uppercase" },

  greeting: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4, letterSpacing: 0.3 },
  title: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 6, textAlign: "center" },
  hint: { fontSize: 11, marginBottom: 18, textAlign: "center", opacity: 0.85, letterSpacing: 0.5, fontFamily: "Inter_500Medium" },

  dotsRow: { flexDirection: "row", gap: 18, marginBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },

  keypad: { width: "100%", gap: 14 },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: 18 },
  key: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
  },
  keyFilled: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  keyText: { fontSize: 26, fontWeight: "500", color: "#fff", fontFamily: "Inter_500Medium" },

  footer: { alignItems: "center", marginTop: 24 },
  footerText: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3, opacity: 0.7 },
});
