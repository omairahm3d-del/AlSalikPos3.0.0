import React, { createContext, useCallback, useContext, useMemo, useReducer, useState } from "react";
import type { CartItem, Product, SelectedModifier } from "@/types";
import { VAT_RATE } from "@/types";

export interface HeldOrderInfo {
  id: string;
  tableId: string;
  tableName: string;
  orderType?: "dine-in" | "takeaway" | "delivery";
}

/** Returns the line key for a cart item: lineId when present (modifier items), product.id otherwise. */
export function cartLineKey(item: CartItem): string {
  return item.lineId ?? item.product.id;
}

type CartAction =
  | { type: "ADD_ITEM"; product: Product; taxRate?: number; selectedModifiers?: SelectedModifier[]; lineId?: string }
  | { type: "ADD_WEIGHTED_ITEM"; product: Product; taxRate?: number; weightKg: number; lineId: string }
  | { type: "REMOVE_ITEM"; itemKey: string }
  | { type: "UPDATE_QUANTITY"; itemKey: string; quantity: number }
  | { type: "SET_ITEM_DISCOUNT"; itemKey: string; discountType?: "percentage" | "fixed"; discountValue?: number }
  | { type: "SET_ITEM_PRICE"; itemKey: string; price: number }
  | { type: "SET_ITEM_STYLIST"; itemKey: string; stylistId?: string; stylistName?: string }
  | { type: "SET_ITEM_NOTES"; itemKey: string; notes?: string }
  | { type: "RESTORE"; items: CartItem[] }
  | { type: "CLEAR" };

interface CartState {
  items: CartItem[];
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  netSubtotal: number;
  itemDiscountTotal: number;
  effectiveSubtotal: number;
  vatAmount: number;
  total: number;
  quantityMap: Record<string, number>;
  heldOrderInfo: HeldOrderInfo | null;
  addItem: (product: Product, taxRate?: number) => void;
  addItemWithModifiers: (product: Product, taxRate: number | undefined, selectedModifiers: SelectedModifier[]) => void;
  addWeightedItem: (product: Product, taxRate: number | undefined, weightKg: number) => void;
  removeItem: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  setItemDiscount: (itemKey: string, discountType?: "percentage" | "fixed", discountValue?: number) => void;
  setItemPrice: (itemKey: string, price: number) => void;
  setItemStylist: (itemKey: string, stylistId?: string, stylistName?: string) => void;
  setItemNotes: (itemKey: string, notes?: string) => void;
  restoreCart: (items: CartItem[], heldInfo?: HeldOrderInfo) => void;
  clearCart: () => void;
  getItemQuantity: (productId: string) => number;
}

/** Effective unit price including modifier adjustments. */
function effectiveUnitPrice(item: CartItem): number {
  return item.product.price + (item.modifierTotal ?? 0);
}

function computeItemDiscount(item: CartItem): number {
  if (!item.discountType || !item.discountValue) return 0;
  const lineBase = effectiveUnitPrice(item) * item.quantity;
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
  const unitPrice = effectiveUnitPrice(item);
  const lineBase = unitPrice * item.quantity;
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
      const incomingLineId = action.lineId;
      const hasModifiers = !!incomingLineId;

      if (!hasModifiers) {
        // Legacy behavior: merge by product.id for modifier-free items.
        const existing = state.items.find((i) => !i.lineId && i.product.id === action.product.id);
        if (existing) {
          return {
            items: state.items.map((i) => {
              if (i.product.id !== action.product.id || i.lineId) return i;
              const updated = { ...i, quantity: i.quantity + 1 };
              updated.discountAmount = computeItemDiscount(updated);
              return updated;
            }),
          };
        }
        return { items: [...state.items, { product: action.product, quantity: 1, taxRate: action.taxRate }] };
      }

      // Modifier item: always a new unique line — never merges.
      const modifierTotal = (action.selectedModifiers ?? []).reduce((s, m) => s + m.priceAdjustment, 0);
      const newItem: CartItem = {
        product: action.product,
        quantity: 1,
        taxRate: action.taxRate,
        selectedModifiers: action.selectedModifiers,
        modifierTotal,
        lineId: incomingLineId,
      };
      return { items: [...state.items, newItem] };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => cartLineKey(i) !== action.itemKey) };
    case "UPDATE_QUANTITY": {
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => cartLineKey(i) !== action.itemKey) };
      }
      return {
        items: state.items.map((i) => {
          if (cartLineKey(i) !== action.itemKey) return i;
          const updated = { ...i, quantity: action.quantity };
          updated.discountAmount = computeItemDiscount(updated);
          return updated;
        }),
      };
    }
    case "SET_ITEM_DISCOUNT": {
      return {
        items: state.items.map((i) => {
          if (cartLineKey(i) !== action.itemKey) return i;
          const updated = { ...i, discountType: action.discountType, discountValue: action.discountValue };
          updated.discountAmount = computeItemDiscount(updated);
          return updated;
        }),
      };
    }
    case "SET_ITEM_PRICE": {
      return {
        items: state.items.map((i) => {
          if (cartLineKey(i) !== action.itemKey) return i;
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
    case "SET_ITEM_STYLIST":
      return {
        items: state.items.map((i) =>
          cartLineKey(i) !== action.itemKey
            ? i
            : { ...i, stylistId: action.stylistId, stylistName: action.stylistName },
        ),
      };
    case "SET_ITEM_NOTES":
      return {
        items: state.items.map((i) =>
          cartLineKey(i) !== action.itemKey
            ? i
            : { ...i, notes: action.notes },
        ),
      };
    case "RESTORE":
      return { items: action.items };
    case "ADD_WEIGHTED_ITEM": {
      // Each weight-scale scan always creates its own unique cart line — never
      // merges with an existing line because the weight differs per label.
      const weightItem: CartItem = {
        product: action.product,
        quantity: action.weightKg,
        taxRate: action.taxRate,
        weightKg: action.weightKg,
        lineId: action.lineId,
      };
      return { items: [...state.items, weightItem] };
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
  const [heldOrderInfo, setHeldOrderInfo] = useState<HeldOrderInfo | null>(null);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );

  // `subtotal` is the gross sum (effective price × qty before any discount).
  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + effectiveUnitPrice(i) * i.quantity, 0),
    [state.items]
  );

  const itemDiscountTotal = useMemo(
    () => state.items.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0),
    [state.items]
  );

  const effectiveSubtotal = useMemo(() => Math.max(0, subtotal - itemDiscountTotal), [subtotal, itemDiscountTotal]);

  const perLine = useMemo(() => state.items.map(computeLineNetVat), [state.items]);
  const vatAmount = useMemo(() => perLine.reduce((s, p) => s + p.vat, 0), [perLine]);
  const netSubtotal = useMemo(() => perLine.reduce((s, p) => s + p.net, 0), [perLine]);

  const total = useMemo(
    () => state.items.reduce((sum, i, idx) => {
      const line = perLine[idx];
      return sum + (i.product.vatInclusive ? line.gross : line.net + line.vat);
    }, 0),
    [state.items, perLine]
  );

  // quantityMap keys on product.id so ProductCard badges show total units across
  // all modifier variants of the same product.
  const quantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of state.items) {
      map[item.product.id] = (map[item.product.id] ?? 0) + item.quantity;
    }
    return map;
  }, [state.items]);

  const addItem = useCallback((product: Product, taxRate?: number) =>
    dispatch({ type: "ADD_ITEM", product, taxRate }), []);

  const addItemWithModifiers = useCallback((
    product: Product,
    taxRate: number | undefined,
    selectedModifiers: SelectedModifier[],
  ) => {
    const lineId = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    dispatch({ type: "ADD_ITEM", product, taxRate, selectedModifiers, lineId });
  }, []);

  const addWeightedItem = useCallback((
    product: Product,
    taxRate: number | undefined,
    weightKg: number,
  ) => {
    const lineId = `w-${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    dispatch({ type: "ADD_WEIGHTED_ITEM", product, taxRate, weightKg, lineId });
  }, []);

  const removeItem = useCallback((itemKey: string) =>
    dispatch({ type: "REMOVE_ITEM", itemKey }), []);
  const updateQuantity = useCallback((itemKey: string, quantity: number) =>
    dispatch({ type: "UPDATE_QUANTITY", itemKey, quantity }), []);
  const setItemDiscount = useCallback((itemKey: string, discountType?: "percentage" | "fixed", discountValue?: number) =>
    dispatch({ type: "SET_ITEM_DISCOUNT", itemKey, discountType, discountValue }), []);
  const setItemPrice = useCallback((itemKey: string, price: number) =>
    dispatch({ type: "SET_ITEM_PRICE", itemKey, price }), []);
  const setItemStylist = useCallback((itemKey: string, stylistId?: string, stylistName?: string) =>
    dispatch({ type: "SET_ITEM_STYLIST", itemKey, stylistId, stylistName }), []);
  const setItemNotes = useCallback((itemKey: string, notes?: string) =>
    dispatch({ type: "SET_ITEM_NOTES", itemKey, notes }), []);
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
    items: state.items, itemCount, subtotal, netSubtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, heldOrderInfo,
    addItem, addItemWithModifiers, addWeightedItem, removeItem, updateQuantity,
    setItemDiscount, setItemPrice, setItemStylist, setItemNotes,
    restoreCart, clearCart, getItemQuantity,
  }), [state.items, itemCount, subtotal, netSubtotal, itemDiscountTotal, effectiveSubtotal,
    vatAmount, total, quantityMap, heldOrderInfo,
    addItem, addItemWithModifiers, addWeightedItem, removeItem, updateQuantity,
    setItemDiscount, setItemPrice, setItemStylist, setItemNotes,
    restoreCart, clearCart, getItemQuantity]);

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
