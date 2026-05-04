import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  sale: Sale;
  expanded: boolean;
  items?: SaleItem[];
  onPress: () => void;
  onPrintReceipt?: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SaleCard({ sale, expanded, items, onPress, onPrintReceipt }: Props) {
  const colors = useColors();
  const isCard = sale.paymentMethod === "Card";
  const isCredit = sale.paymentMethod === "Credit";
  const badgeColor = isCredit ? colors.destructive : isCard ? colors.primary : colors.success;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderColor: expanded ? colors.primary : colors.border,
          borderWidth: expanded ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.total, { color: colors.foreground }]}>
            {formatCurrency(sale.total)}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {formatDate(sale.createdAt)}
          </Text>
          {sale.invoiceNumber ? (
            <Text style={[styles.invoiceNum, { color: colors.mutedForeground }]}>
              {sale.invoiceNumber}
            </Text>
          ) : null}
          {sale.customerName ? (
            <View style={styles.customerTag}>
              <Feather name="user" size={10} color={colors.mutedForeground} />
              <Text style={[styles.customerTagText, { color: colors.mutedForeground }]}>
                {sale.customerName}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rightCol}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: badgeColor + "28",
                borderRadius: colors.radius / 1.5,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: badgeColor },
              ]}
            >
              {sale.paymentMethod}
            </Text>
          </View>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
            style={{ marginTop: 6 }}
          />
        </View>
      </View>

      <View style={styles.vatRow}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Subtotal: {formatCurrency(sale.subtotal)}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          VAT ({Math.round(sale.vatRate * 100)}%): {formatCurrency(sale.vatAmount)}
        </Text>
      </View>

      {expanded && items && items.length > 0 && (
        <View style={[styles.itemsSection, { borderTopColor: colors.border }]}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: colors.mutedForeground }]}>
                {item.productName} × {item.quantity}
              </Text>
              <Text style={[styles.itemTotal, { color: colors.foreground }]}>
                {formatCurrency(item.lineTotal)}
              </Text>
            </View>
          ))}
          {onPrintReceipt && (
            <TouchableOpacity
              onPress={onPrintReceipt}
              style={[styles.printBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <Feather name="printer" size={14} color={colors.primary} />
              <Text style={[styles.printBtnText, { color: colors.primary }]}>View Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    paddingBottom: 8,
  },
  total: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  date: {
    fontSize: 12,
    marginTop: 3,
  },
  invoiceNum: {
    fontSize: 11,
    marginTop: 2,
  },
  customerTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  customerTagText: {
    fontSize: 11,
  },
  rightCol: {
    alignItems: "flex-end",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  vatRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  meta: {
    fontSize: 12,
  },
  itemsSection: {
    borderTopWidth: 1,
    padding: 16,
    paddingTop: 12,
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemName: {
    fontSize: 13,
    flex: 1,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  printBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    gap: 6,
  },
  printBtnText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
