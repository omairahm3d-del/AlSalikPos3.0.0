import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback } from "react";
import type { CartItem, Product, Sale, SaleItem } from "@/types";
import { SEED_PRODUCTS, VAT_RATE } from "@/types";
import { generateId } from "@/lib/database";
import { DatabaseContext } from "./DatabaseCore";

const PRODUCTS_KEY = "@pos_products";
const SALES_KEY = "@pos_sales";
const SALE_ITEMS_KEY = "@pos_sale_items";

async function getProducts(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
  if (!raw) {
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(SEED_PRODUCTS));
    return SEED_PRODUCTS;
  }
  return JSON.parse(raw) as Product[];
}

async function setProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

async function getAllSales(): Promise<Sale[]> {
  const raw = await AsyncStorage.getItem(SALES_KEY);
  return raw ? (JSON.parse(raw) as Sale[]) : [];
}

async function getAllSaleItems(): Promise<SaleItem[]> {
  const raw = await AsyncStorage.getItem(SALE_ITEMS_KEY);
  return raw ? (JSON.parse(raw) as SaleItem[]) : [];
}

export function WebDatabaseProvider({ children }: { children: React.ReactNode }) {
  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const products = await getProducts();
    return [...products].sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    );
  }, []);

  const createProduct = useCallback(async (product: Omit<Product, "id">): Promise<Product> => {
    const products = await getProducts();
    const newProduct: Product = { ...product, id: generateId() };
    await setProducts([...products, newProduct]);
    return newProduct;
  }, []);

  const updateProduct = useCallback(async (product: Product): Promise<void> => {
    const products = await getProducts();
    await setProducts(products.map((p) => (p.id === product.id ? product : p)));
  }, []);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    const products = await getProducts();
    await setProducts(products.filter((p) => p.id !== id));
  }, []);

  const saveSale = useCallback(
    async (items: CartItem[], paymentMethod: string): Promise<Sale> => {
      const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
      const vatAmount = subtotal * VAT_RATE;
      const total = subtotal + vatAmount;
      const saleId = generateId();
      const createdAt = Date.now();

      const sale: Sale = {
        id: saleId,
        createdAt,
        subtotal,
        vatRate: VAT_RATE,
        vatAmount,
        total,
        paymentMethod,
      };

      const saleItems: SaleItem[] = items.map((item) => ({
        id: generateId(),
        saleId,
        productId: item.product.id,
        productName: item.product.name,
        productPrice: item.product.price,
        quantity: item.quantity,
        lineTotal: item.product.price * item.quantity,
      }));

      const existing = await getAllSales();
      await AsyncStorage.setItem(SALES_KEY, JSON.stringify([sale, ...existing]));

      const existingItems = await getAllSaleItems();
      await AsyncStorage.setItem(
        SALE_ITEMS_KEY,
        JSON.stringify([...saleItems, ...existingItems])
      );

      return sale;
    },
    []
  );

  const loadSales = useCallback(async (): Promise<Sale[]> => {
    return getAllSales();
  }, []);

  const loadSaleWithItems = useCallback(async (saleId: string): Promise<Sale | null> => {
    const sales = await getAllSales();
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return null;
    const allItems = await getAllSaleItems();
    return { ...sale, items: allItems.filter((i) => i.saleId === saleId) };
  }, []);

  const loadSalesWithItemsByDateRange = useCallback(
    async (startMs: number, endMs: number): Promise<{ sales: Sale[]; items: SaleItem[] }> => {
      const allSales = await getAllSales();
      const sales = allSales.filter((s) => s.createdAt >= startMs && s.createdAt < endMs);
      if (sales.length === 0) return { sales, items: [] };
      const saleIds = new Set(sales.map((s) => s.id));
      const allItems = await getAllSaleItems();
      const items = allItems.filter((i) => saleIds.has(i.saleId));
      return { sales, items };
    },
    []
  );

  return (
    <DatabaseContext.Provider
      value={{
        loadProducts,
        createProduct,
        updateProduct,
        deleteProduct,
        saveSale,
        loadSales,
        loadSaleWithItems,
        loadSalesWithItemsByDateRange,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
