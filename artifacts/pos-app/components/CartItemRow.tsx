import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { CartItem } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  item: CartItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}

function CartItemRowInner({ item, onUpdateQuantity, onRemoveItem }: Props) {
  const colors = useColors();

  const decrement = useCallback(
    () => onUpdateQuantity(item.product.id, item.quantity - 1),
    [onUpdateQuantity, item.product.id, item.quantity]
  );
  const increment = useCallback(
    () => onUpdateQuantity(item.product.id, item.quantity + 1),
    [onUpdateQuantity, item.product.id, item.quantity]
  );
  const remove = useCallback(
    () => onRemoveItem(item.product.id),
    [onRemoveItem, item.product.id]
  );

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
          {formatCurrency(item.product.price)} each
        </Text>
      </View>

      <View style={styles.qtySection}>
        <TouchableOpacity
          onPress={decrement}
          style={[styles.qtyBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="minus" size={13} color={colors.foreground} />
        </TouchableOpacity>

        <Text style={[styles.qty, { color: colors.foreground }]}>{item.quantity}</Text>

        <TouchableOpacity
          onPress={increment}
          style={[styles.qtyBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={13} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={[styles.lineTotal, { color: colors.foreground }]}>
        {formatCurrency(item.product.price * item.quantity)}
      </Text>

      <TouchableOpacity
        onPress={remove}
        style={styles.deleteBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="trash-2" size={15} color={colors.destructive} />
      </TouchableOpacity>
    </View>
  );
}

export const CartItemRow = React.memo(CartItemRowInner);

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
    width: 34,
    height: 34,
    borderRadius: 17,
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
    width: 70,
    textAlign: "right",
  },
  deleteBtn: {
    paddingLeft: 4,
  },
});
