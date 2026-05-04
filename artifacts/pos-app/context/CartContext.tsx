import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { CartItem, Product } from "@/types";
import { VAT_RATE } from "@/types";

type CartAction =
  | { type: "ADD_ITEM"; product: Product; taxRate?: number }
  | { type: "REMOVE_ITEM"; productId: string }
  | { type: "UPDATE_QUANTITY"; productId: string; quantity: number }
  | { type: "SET_ITEM_DISCOUNT"; productId: string; discountType?: "percentage" | "fixed"; discountValue?: number }
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
  addItem: (product: Product, taxRate?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setItemDiscount: (productId: string, discountType?: "percentage" | "fixed", discountValue?: number) => void;
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
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );

  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    [state.items]
  );

  const itemDiscountTotal = useMemo(
    () => state.items.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0),
    [state.items]
  );

  const effectiveSubtotal = useMemo(() => Math.max(0, subtotal - itemDiscountTotal), [subtotal, itemDiscountTotal]);
  const vatAmount = useMemo(() => {
    let vat = 0;
    for (const item of state.items) {
      const lineAfterDisc = item.product.price * item.quantity - (item.discountAmount ?? 0);
      const rate = item.taxRate ?? VAT_RATE;
      vat += Math.max(0, lineAfterDisc) * rate;
    }
    return vat;
  }, [state.items]);
  const total = useMemo(() => effectiveSubtotal + vatAmount, [effectiveSubtotal, vatAmount]);

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
  const clearCart = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const getItemQuantity = useCallback((productId: string) =>
    state.items.find((i) => i.product.id === productId)?.quantity ?? 0, [state.items]);

  const value = useMemo(() => ({
    items: state.items, itemCount, subtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, addItem, removeItem, updateQuantity, setItemDiscount, clearCart, getItemQuantity,
  }), [state.items, itemCount, subtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, addItem, removeItem, updateQuantity, setItemDiscount, clearCart, getItemQuantity]);

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
