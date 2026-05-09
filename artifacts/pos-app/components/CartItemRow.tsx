import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { CartItem } from "@/types";
import { CURRENCY, formatCurrency } from "@/types";
import { cartLineKey } from "@/context/CartContext";

interface Props {
  item: CartItem;
  onUpdateQuantity: (itemKey: string, quantity: number) => void;
  onRemoveItem: (itemKey: string) => void;
}

function CartItemRowInner({ item, onUpdateQuantity, onRemoveItem }: Props) {
  const colors = useColors();
  const key = cartLineKey(item);

  const decrement = useCallback(
    () => onUpdateQuantity(key, item.quantity - 1),
    [onUpdateQuantity, key, item.quantity]
  );
  const increment = useCallback(
    () => onUpdateQuantity(key, item.quantity + 1),
    [onUpdateQuantity, key, item.quantity]
  );
  const remove = useCallback(
    () => onRemoveItem(key),
    [onRemoveItem, key]
  );

  const effectivePrice = item.product.price + (item.modifierTotal ?? 0);
  const lineTotal = effectivePrice * item.quantity - (item.discountAmount ?? 0);

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.colorDot, { backgroundColor: item.product.colorHex }]} />

      <View style={styles.nameSection}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {item.product.name}
        </Text>
        {item.selectedModifiers && item.selectedModifiers.length > 0 ? (
          <View style={styles.modifierList}>
            {item.selectedModifiers.map((m) => (
              <Text key={m.optionId} style={[styles.modifierChip, { color: colors.mutedForeground }]} numberOfLines={1}>
                · {m.optionName}{m.priceAdjustment !== 0 ? ` (${m.priceAdjustment > 0 ? "+" : ""}${CURRENCY} ${Math.abs(m.priceAdjustment).toFixed(2)})` : ""}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={[styles.unitPrice, { color: colors.mutedForeground }]}>
          {formatCurrency(effectivePrice)} each
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
        {formatCurrency(lineTotal)}
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
    alignSelf: "flex-start",
    marginTop: 4,
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
  modifierList: {
    marginTop: 2,
  },
  modifierChip: {
    fontSize: 10,
    lineHeight: 15,
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
