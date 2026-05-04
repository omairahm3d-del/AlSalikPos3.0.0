import { createContext, useContext } from "react";
import type { BusinessSettings, CartItem, CreditPayment, Customer, Product, Sale, SaleItem } from "@/types";

export interface DatabaseContextValue {
  loadProducts: () => Promise<Product[]>;
  createProduct: (product: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  saveSale: (items: CartItem[], paymentMethod: string, customerId?: string, customerName?: string) => Promise<Sale>;
  loadSales: () => Promise<Sale[]>;
  loadSaleWithItems: (saleId: string) => Promise<Sale | null>;
  loadSalesWithItemsByDateRange: (startMs: number, endMs: number) => Promise<{ sales: Sale[]; items: SaleItem[] }>;
  loadBusinessSettings: () => Promise<BusinessSettings>;
  saveBusinessSettings: (settings: BusinessSettings) => Promise<void>;
  loadCustomers: () => Promise<Customer[]>;
  createCustomer: (customer: Omit<Customer, "id" | "creditBalance" | "createdAt">) => Promise<Customer>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordCreditPayment: (customerId: string, amount: number, note: string) => Promise<CreditPayment>;
  loadCreditPayments: (customerId: string) => Promise<CreditPayment[]>;
}

export const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useDatabase must be used within a DatabaseProvider");
  return ctx;
}
