import React, { createContext, useCallback, useContext, useMemo, useReducer, useState } from "react";
import type { CartItem, Product } from "@/types";
import { VAT_RATE } from "@/types";

export interface HeldOrderInfo {
  id: string;
  tableId: string;
  tableName: string;
  orderType?: "dine-in" | "takeaway" | "delivery";
}

type CartAction =
  | { type: "ADD_ITEM"; product: Product; taxRate?: number }
  | { type: "REMOVE_ITEM"; productId: string }
  | { type: "UPDATE_QUANTITY"; productId: string; quantity: number }
  | { type: "SET_ITEM_DISCOUNT"; productId: string; discountType?: "percentage" | "fixed"; discountValue?: number }
  | { type: "SET_ITEM_PRICE"; productId: string; price: number }
  | { type: "RESTORE"; items: CartItem[] }
  | { type: "CLEAR" };

interface CartState {
  items: CartItem[];
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  itemDiscountTotal: number;
  effectiveSubtotal: number;
  vatAmount: number;
  total: number;
  quantityMap: Record<string, number>;
  heldOrderInfo: HeldOrderInfo | null;
  addItem: (product: Product, taxRate?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setItemDiscount: (productId: string, discountType?: "percentage" | "fixed", discountValue?: number) => void;
  setItemPrice: (productId: string, price: number) => void;
  restoreCart: (items: CartItem[], heldInfo?: HeldOrderInfo) => void;
  clearCart: () => void;
  getItemQuantity: (productId: string) => number;
}

function computeItemDiscount(item: CartItem): number {
  if (!item.discountType || !item.discountValue) return 0;
  const lineBase = item.product.price * item.quantity;
  if (item.discountType === "percentage") {
    return Math.min(lineBase, lineBase * item.discountValue / 100);
  }
  return Math.min(lineBase, item.discountValue);
}

/**
 * Per-line net + VAT calculation respecting the per-product
 * `vatInclusive` flag. When the flag is on, the displayed price already
 * includes VAT and we back-calculate to derive the net component for
 * UAE-compliant tax invoices (VAT must always be shown as a separate
 * line). When off, VAT is added on top.
 */
export function computeLineNetVat(item: CartItem): { net: number; vat: number; gross: number } {
  const lineBase = item.product.price * item.quantity;
  const disc = item.discountAmount ?? 0;
  const lineGross = Math.max(0, lineBase - disc);
  const rate = Math.max(0, item.taxRate ?? VAT_RATE);
  if (rate <= 0) return { net: lineGross, vat: 0, gross: lineGross };
  if (item.product.vatInclusive) {
    const vat = lineGross * rate / (1 + rate);
    return { net: lineGross - vat, vat, gross: lineGross };
  }
  return { net: lineGross, vat: lineGross * rate, gross: lineGross };
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) => {
            if (i.product.id !== action.product.id) return i;
            const updated = { ...i, quantity: i.quantity + 1 };
            updated.discountAmount = computeItemDiscount(updated);
            return updated;
          }),
        };
      }
      return { items: [...state.items, { product: action.product, quantity: 1, taxRate: action.taxRate }] };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => i.product.id !== action.productId) };
    case "UPDATE_QUANTITY": {
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.product.id !== action.productId) };
      }
      return {
        items: state.items.map((i) => {
          if (i.product.id !== action.productId) return i;
          const updated = { ...i, quantity: action.quantity };
          updated.discountAmount = computeItemDiscount(updated);
          return updated;
        }),
      };
    }
    case "SET_ITEM_DISCOUNT": {
      return {
        items: state.items.map((i) => {
          if (i.product.id !== action.productId) return i;
          const updated = { ...i, discountType: action.discountType, discountValue: action.discountValue };
          updated.discountAmount = computeItemDiscount(updated);
          return updated;
        }),
      };
    }
    case "SET_ITEM_PRICE": {
      // Clone the product so the override is scoped to THIS cart line —
      // the underlying catalog row is never mutated. Recompute the
      // existing item discount against the new price.
      return {
        items: state.items.map((i) => {
          if (i.product.id !== action.productId) return i;
          const newPrice = Math.max(0, action.price);
          const updated: CartItem = {
            ...i,
            product: { ...i.product, price: newPrice },
          };
          updated.discountAmount = computeItemDiscount(updated);
          return updated;
        }),
      };
    }
    case "RESTORE":
      return { items: action.items };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [heldOrderInfo, setHeldOrderInfo] = useState<HeldOrderInfo | null>(null);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );

  // `subtotal` is the gross sum (price × qty before any discount). Kept
  // as a display-only value for the cart UI's "Subtotal" line so users
  // see the total they typed in. The accounting subtotal (net of VAT)
  // is computed in saveSale() via computeLineNetVat per line.
  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    [state.items]
  );

  const itemDiscountTotal = useMemo(
    () => state.items.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0),
    [state.items]
  );

  const effectiveSubtotal = useMemo(() => Math.max(0, subtotal - itemDiscountTotal), [subtotal, itemDiscountTotal]);

  const perLine = useMemo(() => state.items.map(computeLineNetVat), [state.items]);
  const vatAmount = useMemo(() => perLine.reduce((s, p) => s + p.vat, 0), [perLine]);

  // For inclusive items the gross already contains VAT, so total =
  // gross. For exclusive items, total = net + vat = gross + vat. Doing
  // it per-line keeps mixed carts correct.
  const total = useMemo(
    () => state.items.reduce((sum, i, idx) => {
      const line = perLine[idx];
      return sum + (i.product.vatInclusive ? line.gross : line.net + line.vat);
    }, 0),
    [state.items, perLine]
  );

  const quantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of state.items) {
      map[item.product.id] = item.quantity;
    }
    return map;
  }, [state.items]);

  const addItem = useCallback((product: Product, taxRate?: number) => dispatch({ type: "ADD_ITEM", product, taxRate }), []);
  const removeItem = useCallback((productId: string) => dispatch({ type: "REMOVE_ITEM", productId }), []);
  const updateQuantity = useCallback((productId: string, quantity: number) =>
    dispatch({ type: "UPDATE_QUANTITY", productId, quantity }), []);
  const setItemDiscount = useCallback((productId: string, discountType?: "percentage" | "fixed", discountValue?: number) =>
    dispatch({ type: "SET_ITEM_DISCOUNT", productId, discountType, discountValue }), []);
  const setItemPrice = useCallback((productId: string, price: number) =>
    dispatch({ type: "SET_ITEM_PRICE", productId, price }), []);
  const restoreCart = useCallback((items: CartItem[], heldInfo?: HeldOrderInfo) => {
    dispatch({ type: "RESTORE", items });
    setHeldOrderInfo(heldInfo ?? null);
  }, []);
  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR" });
    setHeldOrderInfo(null);
  }, []);
  const getItemQuantity = useCallback((productId: string) =>
    state.items.find((i) => i.product.id === productId)?.quantity ?? 0, [state.items]);

  const value = useMemo(() => ({
    items: state.items, itemCount, subtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, heldOrderInfo, addItem, removeItem, updateQuantity, setItemDiscount, setItemPrice, restoreCart, clearCart, getItemQuantity,
  }), [state.items, itemCount, subtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, heldOrderInfo, addItem, removeItem, updateQuantity, setItemDiscount, setItemPrice, restoreCart, clearCart, getItemQuantity]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
