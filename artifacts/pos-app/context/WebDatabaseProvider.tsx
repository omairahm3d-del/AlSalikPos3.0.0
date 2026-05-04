import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback } from "react";
import type { BusinessSettings, CartItem, CreditPayment, Customer, Product, Sale, SaleItem } from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, SEED_PRODUCTS, VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { DatabaseContext } from "./DatabaseCore";

const PRODUCTS_KEY = "@pos_products";
const SALES_KEY = "@pos_sales";
const SALE_ITEMS_KEY = "@pos_sale_items";
const SETTINGS_KEY = "@pos_settings";
const COUNTER_KEY = "@pos_invoice_counter";
const CUSTOMERS_KEY = "@pos_customers";
const CREDIT_PAYMENTS_KEY = "@pos_credit_payments";

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

async function getAllCustomers(): Promise<Customer[]> {
  const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
  return raw ? (JSON.parse(raw) as Customer[]) : [];
}

async function setCustomers(customers: Customer[]): Promise<void> {
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
}

async function getAllCreditPayments(): Promise<CreditPayment[]> {
  const raw = await AsyncStorage.getItem(CREDIT_PAYMENTS_KEY);
  return raw ? (JSON.parse(raw) as CreditPayment[]) : [];
}

export function WebDatabaseProvider({ children }: { children: React.ReactNode }) {
  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const products = await getProducts();
    return [...products].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
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
    async (items: CartItem[], paymentMethod: string, customerId?: string, customerName?: string): Promise<Sale> => {
      if (paymentMethod === "Credit" && !customerId) {
        throw new Error("Credit sales require a customer");
      }

      const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
      const vatAmount = subtotal * VAT_RATE;
      const total = subtotal + vatAmount;
      const saleId = generateId();
      const createdAt = Date.now();

      const existing = await getAllSales();
      const raw = await AsyncStorage.getItem(COUNTER_KEY);
      const seq = raw ? parseInt(raw, 10) : existing.length + 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1);
      await AsyncStorage.setItem(COUNTER_KEY, String(seq + 1));

      const sale: Sale = {
        id: saleId, invoiceNumber, createdAt, subtotal,
        vatRate: VAT_RATE, vatAmount, total, paymentMethod,
        customerId, customerName,
      };

      const saleItems: SaleItem[] = items.map((item) => ({
        id: generateId(), saleId, productId: item.product.id,
        productName: item.product.name, productPrice: item.product.price,
        quantity: item.quantity, lineTotal: item.product.price * item.quantity,
      }));

      await AsyncStorage.setItem(SALES_KEY, JSON.stringify([sale, ...existing]));
      const existingItems = await getAllSaleItems();
      await AsyncStorage.setItem(SALE_ITEMS_KEY, JSON.stringify([...saleItems, ...existingItems]));

      if (paymentMethod === "Credit" && customerId) {
        const customers = await getAllCustomers();
        const target = customers.find((c) => c.id === customerId);
        if (!target) throw new Error("Customer not found");
        await setCustomers(
          customers.map((c) =>
            c.id === customerId ? { ...c, creditBalance: c.creditBalance + total } : c
          )
        );
      }

      return sale;
    },
    []
  );

  const loadSales = useCallback(async (): Promise<Sale[]> => getAllSales(), []);

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

  const loadBusinessSettings = useCallback(async (): Promise<BusinessSettings> => {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_BUSINESS_SETTINGS };
    return JSON.parse(raw) as BusinessSettings;
  }, []);

  const saveBusinessSettings = useCallback(async (settings: BusinessSettings): Promise<void> => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, []);

  const loadCustomers = useCallback(async (): Promise<Customer[]> => {
    const customers = await getAllCustomers();
    return [...customers].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createCustomer = useCallback(
    async (customer: Omit<Customer, "id" | "creditBalance" | "createdAt">): Promise<Customer> => {
      const customers = await getAllCustomers();
      const newCustomer: Customer = { ...customer, id: generateId(), creditBalance: 0, createdAt: Date.now() };
      await setCustomers([...customers, newCustomer]);
      return newCustomer;
    },
    []
  );

  const updateCustomer = useCallback(async (customer: Customer): Promise<void> => {
    const customers = await getAllCustomers();
    await setCustomers(customers.map((c) => (c.id === customer.id ? customer : c)));
  }, []);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    const customers = await getAllCustomers();
    const target = customers.find((c) => c.id === id);
    if (target && target.creditBalance > 0) {
      throw new Error("Cannot delete customer with outstanding balance");
    }
    await setCustomers(customers.filter((c) => c.id !== id));
  }, []);

  const recordCreditPayment = useCallback(
    async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
      if (amount <= 0) throw new Error("Payment amount must be positive");

      const customers = await getAllCustomers();
      const target = customers.find((c) => c.id === customerId);
      if (!target) throw new Error("Customer not found");
      if (amount > target.creditBalance) throw new Error("Payment exceeds outstanding balance");

      const payment: CreditPayment = { id: generateId(), customerId, amount, note, createdAt: Date.now() };
      const existing = await getAllCreditPayments();
      await AsyncStorage.setItem(CREDIT_PAYMENTS_KEY, JSON.stringify([payment, ...existing]));
      await setCustomers(
        customers.map((c) =>
          c.id === customerId ? { ...c, creditBalance: c.creditBalance - amount } : c
        )
      );
      return payment;
    },
    []
  );

  const loadCreditPayments = useCallback(async (customerId: string): Promise<CreditPayment[]> => {
    const all = await getAllCreditPayments();
    return all.filter((p) => p.customerId === customerId);
  }, []);

  return (
    <DatabaseContext.Provider
      value={{
        loadProducts, createProduct, updateProduct, deleteProduct,
        saveSale, loadSales, loadSaleWithItems, loadSalesWithItemsByDateRange,
        loadBusinessSettings, saveBusinessSettings,
        loadCustomers, createCustomer, updateCustomer, deleteCustomer,
        recordCreditPayment, loadCreditPayments,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
