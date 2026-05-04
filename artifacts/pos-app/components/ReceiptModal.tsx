import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import { generateReceiptHTML } from "@/lib/receiptTemplate";
import type { BusinessSettings, Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  visible: boolean;
  sale: Sale | null;
  onClose: () => void;
}

export function ReceiptModal({ visible, sale, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSaleWithItems, loadBusinessSettings } = useDatabase();

  const [items, setItems] = useState<SaleItem[]>([]);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!sale) return;
    setLoading(true);
    try {
      const [saleData, settings] = await Promise.all([
        loadSaleWithItems(sale.id),
        loadBusinessSettings(),
      ]);
      setItems(saleData?.items ?? []);
      setBusiness(settings);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sale, loadSaleWithItems, loadBusinessSettings]);

  useEffect(() => {
    if (visible && sale) loadData();
  }, [visible, sale, loadData]);

  const isTrnValid = business?.trn ? /^\d{15}$/.test(business.trn) : false;

  const handlePrint = async () => {
    if (!sale || !business) return;
    const html = generateReceiptHTML(sale, items, business);
    if (Platform.OS === "web") {
      const w = window.open("", "_blank", "width=350,height=600");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 300);
      }
      return;
    }
    try {
      const Print = await import("expo-print");
      await Print.printAsync({ html });
    } catch {
    }
  };

  const handleShare = async () => {
    if (!sale || !business) return;
    if (Platform.OS === "web") {
      handlePrint();
      return;
    }
    try {
      const Print = await import("expo-print");
      const html = generateReceiptHTML(sale, items, business);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const Sharing = await import("expo-sharing");
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Receipt" });
    } catch {
    }
  };

  if (!sale) return null;

  const vatPct = Math.round(sale.vatRate * 100);
  const dateStr = new Date(sale.createdAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.root, { backgroundColor: colors.background }]}>