import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";
import type { CartItem } from "@/types";

interface Props {
  item: CartItem;
}

export function CartItemRow({ item }: Props) {
  const colors = useColors();
  const { updateQuantity, removeItem } = useCart();

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.colorDot, { backgroundColor: item.product.colorHex }]} />

      <View style={styles.nameSection}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {item.product.name}
        </Text>
        <Text style={[styles.unitPrice, { color: colors.mutedForeground }]}>
          €{item.product.price.toFixed(2)} each
        </Text>
      </View>

      <View style={styles.qtySection}>
        <TouchableOpacity
          onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
          style={[styles.qtyBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="minus" size={13} color={colors.foreground} />
        </TouchableOpacity>

        <Text style={[styles.qty, { color: colors.foreground }]}>{item.quantity}</Text>

        <TouchableOpacity
          onPress={() => updateQuantity(item.product.id, item.quantity + 1)}
          style={[styles.qtyBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={13} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={[styles.lineTotal, { color: colors.foreground }]}>
        €{(item.product.price * item.quantity).toFixed(2)}
      </Text>

      <TouchableOpacity
        onPress={() => removeItem(item.product.id)}
        style={styles.deleteBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="trash-2" size={15} color={colors.destructive} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nameSection: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  unitPrice: {
    fontSize: 11,
    marginTop: 2,
  },
  qtySection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    minWidth: 22,
    textAlign: "center",
  },
  lineTotal: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    width: 60,
    textAlign: "right",
  },
  deleteBtn: {
    paddingLeft: 4,
  },
});
