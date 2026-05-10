import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Product, WeightBarcodeSettings } from "@/types";
import { isWeightBarcode, parseWeightBarcode } from "@/lib/weightBarcode";

interface Props {
  visible: boolean;
  products: Product[];
  onFound: (product: Product) => void;
  onNotFound: (barcode: string) => void;
  onClose: () => void;
  /** Optional: used in Products screen to capture a barcode for assignment */
  assignMode?: boolean;
  onAssign?: (barcode: string) => void;
  /**
   * Retail mode: when provided and enabled, weight-scale EAN-13 barcodes
   * (prefix 20–29) are decoded and the matched product + weight are passed
   * to onFoundWeighed instead of the normal onFound handler.
   */
  weightBarcodeSettings?: WeightBarcodeSettings;
  onFoundWeighed?: (product: Product, weightKg: number) => void;
}

const SCAN_COOLDOWN_MS = 1500;

export function BarcodeScannerModal({
  visible,
  products,
  onFound,
  onNotFound,
  onClose,
  assignMode = false,
  onAssign,
  weightBarcodeSettings,
  onFoundWeighed,
}: Props) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScan, setLastScan] = useState(0);
  const [scanResult, setScanResult] = useState<{
    type: "found" | "not_found";
    label: string;
  } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  useEffect(() => {
    if (!visible) {
      setScanResult(null);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    }
  }, [visible]);

  const handleBarcode = ({ data }: { data: string }) => {
    const now = Date.now();
    if (now - lastScan < SCAN_COOLDOWN_MS) return;
    setLastScan(now);

    if (assignMode && onAssign) {
      onAssign(data);
      return;
    }

    const match = products.find((p) => p.barcode === data);
    if (match) {
      setScanResult({ type: "found", label: match.name });
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => {
        setScanResult(null);
        onFound(match);
      }, 700);
      return;
    }

    // Weight-scale barcode fallback (retail mode).
    // Barcodes with prefix 20–29 embed a 5-digit PLU and a weight/price.
    // Look up the product by matching product.barcode === parsed PLU string.
    if (weightBarcodeSettings?.enabled && !assignMode) {
      if (isWeightBarcode(data, weightBarcodeSettings.prefixes)) {
        const parsed = parseWeightBarcode(data, weightBarcodeSettings);
        if (parsed?.weightKg != null && parsed.weightKg > 0) {
          const pluMatch = products.find((p) => p.barcode === parsed.plu);
          if (pluMatch) {
            const label = `${parsed.weightKg.toFixed(3)} kg × ${pluMatch.name}`;
            setScanResult({ type: "found", label });
            if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
            feedbackTimer.current = setTimeout(() => {
              setScanResult(null);
              onFoundWeighed?.(pluMatch, parsed.weightKg!);
            }, 700);
            return;
          }
        }
      }
    }

    setScanResult({ type: "not_found", label: data });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => {
      setScanResult(null);
      onNotFound(data);
    }, 1000);
  };

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Feather name="camera-off" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              Camera unavailable
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Barcode scanning requires a physical device.{"\n"}Use Expo Go on Android or iOS.
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.root}>
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Feather name="camera-off" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              Camera permission required
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Allow camera access to scan barcodes
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              style={[styles.closeBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginBottom: 12 }]}
            >
              <Text style={styles.closeBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr", "code128", "code39"] }}
              onBarcodeScanned={handleBarcode}
            />

            {/* Overlay UI */}
            <View style={styles.overlay} pointerEvents="box-none">
              {/* Header bar */}
              <View style={styles.header}>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.headerBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                >
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                  {assignMode ? "Scan to Assign Barcode" : "Scan Barcode"}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Viewfinder */}
              <View style={styles.viewfinderArea} pointerEvents="none">
                <View style={styles.viewfinder}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <Text style={styles.scanHint}>
                  {assignMode
                    ? "Point at the barcode to link it to this product"
                    : "Point at a product barcode to add it to the cart"}
                </Text>
              </View>

              {/* Feedback banner */}
              {scanResult && (
                <View
                  style={[
                    styles.feedback,
                    {
                      backgroundColor:
                        scanResult.type === "found"
                          ? "rgba(46,204,113,0.95)"
                          : "rgba(231,76,60,0.95)",
                    },
                  ]}
                >
                  <Feather
                    name={scanResult.type === "found" ? "check-circle" : "alert-circle"}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.feedbackText}>
                    {scanResult.type === "found"
                      ? `Added: ${scanResult.label}`
                      : assignMode
                      ? `Barcode: ${scanResult.label}`
                      : `Not found: ${scanResult.label}`}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;
const CORNER_COLOR = "#fff";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#0F1117" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewfinderArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  viewfinder: {
    width: 260,
    height: 180,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
    borderBottomRightRadius: 4,
  },
  scanHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 48,
    padding: 14,
    borderRadius: 12,
  },
  feedbackText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  sheet: {
    margin: 32,
    padding: 32,
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  closeBtn: { paddingHorizontal: 32, paddingVertical: 13 },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
