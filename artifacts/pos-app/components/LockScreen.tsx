import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Vibration } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";

export function LockScreen() {
  const colors = useColors();
  const { login } = useStaff();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePress = async (digit: string) => {
    if (loading) return;
    setError(false);
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length >= 4) {
      setLoading(true);
      const ok = await login(newPin);
      if (!ok) {
        setError(true);
        setPin("");
        Vibration.vibrate(200);
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.brandWrap}>
          <View style={[styles.brandLogo, { backgroundColor: "#6C63FF" }]}>
            <Feather name="shopping-bag" size={26} color="#fff" />
          </View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>Al Salik POS</Text>
          <Text style={[styles.brandSub, { color: "#6C63FF" }]}>by Al Salik Computers</Text>
        </View>

        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
          <Feather name="lock" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Staff Login</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {error ? "Incorrect PIN. Try again." : "Enter your 4-digit PIN"}
        </Text>

        <View style={styles.dotsRow}>
          {dots.map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i < pin.length
                    ? (error ? colors.destructive : colors.primary)
                    : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.keypad}>
          {keys.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key) => {
                if (key === "") return <View key="empty" style={styles.key} />;
                if (key === "back") {
                  return (
                    <TouchableOpacity key="back" style={styles.key} onPress={handleBackspace}>
                      <Feather name="delete" size={22} color={colors.foreground} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.key, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handlePress(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.keyText, { color: colors.foreground }]}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { alignItems: "center", width: "100%", maxWidth: 320 },
  brandWrap: { alignItems: "center", marginBottom: 28 },
  brandLogo: { width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  brandName: { fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  brandSub: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", marginTop: 4, letterSpacing: 0.3 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28 },
  dotsRow: { flexDirection: "row", gap: 16, marginBottom: 36 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  keypad: { width: "100%", gap: 12 },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: 16 },
  key: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent",
  },
  keyText: { fontSize: 26, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
