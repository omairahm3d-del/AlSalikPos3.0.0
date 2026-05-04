import React, { useCallback, useRef } from "react";
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import type { Product } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  product: Product;
  onAdd: (productId: string) => void;
  quantity: number;
}

function ProductCardInner({ product, onAdd, quantity }: Props) {
  const colors = useColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isOutOfStock = product.stockQuantity <= 0;
  const isLowStock = !isOutOfStock && product.stockQuantity <= (product.lowStockThreshold ?? 5);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 70, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(product.id);
  }, [onAdd, product.id, scaleAnim]);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={isOutOfStock ? 1 : 0.9}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            borderColor: quantity > 0 ? colors.primary : colors.border,
            borderWidth: quantity > 0 ? 2 : 1,
            opacity: isOutOfStock ? 0.5 : 1,
          },
        ]}
      >
        {product.imageUri ? (
          <View style={styles.imageBand}>
            <Image source={{ uri: product.imageUri }} style={styles.productImage} resizeMode="cover" />
            {isOutOfStock && (
              <View style={styles.stockOverlay}>
                <Text style={styles.stockOverlayText}>OUT OF STOCK</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.colorBand, { backgroundColor: product.colorHex }]}>
            <Text style={styles.initial}>{product.name.charAt(0).toUpperCase()}</Text>
            {isOutOfStock && (
              <View style={styles.stockOverlay}>
                <Text style={styles.stockOverlayText}>OUT OF STOCK</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.primary }]}>
              {formatCurrency(product.price)}
            </Text>
            {isLowStock && (
              <View style={[styles.lowStockBadge, { backgroundColor: "#F39C12" + "20" }]}>
                <Text style={styles.lowStockText}>{product.stockQuantity} left</Text>
              </View>
            )}
          </View>
        </View>

        {quantity > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{quantity}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export const ProductCard = React.memo(ProductCardInner);

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    margin: 5,
    minWidth: 100,
  },
  card: {
    overflow: "hidden",
  },
  colorBand: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  imageBand: {
    height: 80,
    backgroundColor: "#1A1D25",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  initial: {
    fontSize: 34,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Inter_700Bold",
  },
  stockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  stockOverlayText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
  },
  info: {
    padding: 10,
    paddingTop: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  lowStockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockText: {
    color: "#F39C12",
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  badge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
