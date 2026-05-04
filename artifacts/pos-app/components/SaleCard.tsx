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
  onRefund?: () => void;
  isRefunded?: boolean;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SaleCard({ sale, expanded, items, onPress, onPrintReceipt, onRefund, isRefunded }: Props) {
  const colors = useColors();
  const isCard = sale.paymentMethod === "Card";
  const isCredit = sale.paymentMethod === "Credit";
  const isSplit = sale.paymentMethod === "Split";
  const isRefund = sale.isRefund;
  const badgeColor = isRefund ? "#E74C3C" : isCredit ? colors.destructive : isSplit ? "#F39C12" : isCard ? colors.primary : colors.success;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, {
        backgroundColor: colors.card, borderRadius: colors.radius,
        borderColor: isRefund ? colors.destructive + "40" : expanded ? colors.primary : colors.border,
        borderWidth: expanded ? 1.5 : 1,
        opacity: isRefunded ? 0.6 : 1,
      }]}
    >
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.total, { color: isRefund ? colors.destructive : colors.foreground }]}>
              {isRefund ? "-" : ""}{formatCurrency(Math.abs(sale.total))}
            </Text>
            {isRefund && (
              <View style={[styles.refundBadge, { backgroundColor: colors.destructive + "20" }]}>
                <Text style={[styles.refundBadgeText, { color: colors.destructive }]}>REFUND</Text>
              </View>
            )}
            {isRefunded && !isRefund && (
              <View style={[styles.refundBadge, { backgroundColor: colors.mutedForeground + "20" }]}>
                <Text style={[styles.refundBadgeText, { color: colors.mutedForeground }]}>REFUNDED</Text>
              </View>
            )}
          </View>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(sale.createdAt)}</Text>
          {sale.invoiceNumber ? <Text style={[styles.invoiceNum, { color: colors.mutedForeground }]}>{sale.invoiceNumber}</Text> : null}
          {sale.staffName ? (
            <View style={styles.tagRow}>
              <Feather name="user-check" size={10} color={colors.mutedForeground} />
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{sale.staffName}</Text>
            </View>
          ) : null}
          {sale.customerName ? (
            <View style={styles.tagRow}>
              <Feather name="user" size={10} color={colors.mutedForeground} />
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{sale.customerName}</Text>
            </View>
          ) : null}
          {sale.tableName ? (
            <View style={styles.tagRow}>
              <Feather name="grid" size={10} color={colors.mutedForeground} />
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{sale.tableName}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rightCol}>
          <View style={[styles.badge, { backgroundColor: badgeColor + "28", borderRadius: colors.radius / 1.5 }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>
              {isRefund ? "Refund" : sale.paymentMethod}
            </Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} style={{ marginTop: 6 }} />
        </View>
      </View>

      <View style={styles.vatRow}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Subtotal: {formatCurrency(Math.abs(sale.subtotal))}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          VAT ({Math.round(sale.vatRate * 100)}%): {formatCurrency(Math.abs(sale.vatAmount))}
        </Text>
        {(sale.discountAmount ?? 0) > 0 && (
          <Text style={[styles.meta, { color: colors.success }]}>
            Disc: -{formatCurrency(sale.discountAmount!)}
          </Text>
        )}
      </View>

      {expanded && items && items.length > 0 && (
        <View style={[styles.itemsSection, { borderTopColor: colors.border }]}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: colors.mutedForeground }]}>
                {item.productName} x {Math.abs(item.quantity)}
                {(item.discountAmount ?? 0) > 0 ? ` (-${formatCurrency(item.discountAmount!)})` : ""}
              </Text>
              <Text style={[styles.itemTotal, { color: colors.foreground }]}>{formatCurrency(Math.abs(item.lineTotal))}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {onPrintReceipt && (
              <TouchableOpacity onPress={onPrintReceipt} style={[styles.actionBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
                <Feather name="printer" size={14} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Receipt</Text>
              </TouchableOpacity>
            )}
            {onRefund && !isRefund && !isRefunded && (
              <TouchableOpacity onPress={onRefund} style={[styles.actionBtn, { borderColor: colors.destructive + "40", borderRadius: colors.radius }]}>
                <Feather name="rotate-ccw" size={14} color={colors.destructive} />
                <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Refund</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 6, overflow: "hidden" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  total: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  date: { fontSize: 12, marginTop: 3 },
  invoiceNum: { fontSize: 11, marginTop: 2 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  tagText: { fontSize: 11 },
  rightCol: { alignItems: "flex-end" },
  badge: { paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  refundBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  refundBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  vatRow: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 14, flexWrap: "wrap" },
  meta: { fontSize: 12 },
  itemsSection: { borderTopWidth: 1, padding: 16, paddingTop: 12, gap: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { fontSize: 13, flex: 1 },
  itemTotal: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1, gap: 6 },
  actionBtnText: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
