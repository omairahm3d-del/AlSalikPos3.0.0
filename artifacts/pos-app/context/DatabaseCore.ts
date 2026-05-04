import { createContext, useContext } from "react";
import type {
  BusinessSettings, CartItem, CreditPayment, Customer,
  PosTable, Product, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";

export interface SaleOptions {
  paymentMethod: string;
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  tableId?: string;
  tableName?: string;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  loyaltyPointsRedeemed?: number;
  splitPayments?: SplitPaymentEntry[];
}

export interface DatabaseContextValue {
  loadProducts: () => Promise<Product[]>;
  createProduct: (product: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateStock: (productId: string, delta: number) => Promise<void>;

  saveSale: (items: CartItem[], options: SaleOptions) => Promise<Sale>;
  loadSales: () => Promise<Sale[]>;
  loadSaleWithItems: (saleId: string) => Promise<Sale | null>;
  loadSalesWithItemsByDateRange: (startMs: number, endMs: number) => Promise<{ sales: Sale[]; items: SaleItem[] }>;
  processRefund: (originalSaleId: string, staffId?: string, staffName?: string) => Promise<Sale>;

  loadBusinessSettings: () => Promise<BusinessSettings>;
  saveBusinessSettings: (settings: BusinessSettings) => Promise<void>;

  loadCustomers: () => Promise<Customer[]>;
  createCustomer: (customer: Omit<Customer, "id" | "creditBalance" | "loyaltyPoints" | "createdAt">) => Promise<Customer>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordCreditPayment: (customerId: string, amount: number, note: string) => Promise<CreditPayment>;
  loadCreditPayments: (customerId: string) => Promise<CreditPayment[]>;
  updateLoyaltyPoints: (customerId: string, delta: number) => Promise<void>;

  loadStaff: () => Promise<Staff[]>;
  createStaff: (staff: Omit<Staff, "id" | "active" | "createdAt">) => Promise<Staff>;
  updateStaff: (staff: Staff) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;
  authenticateStaff: (pin: string) => Promise<Staff | null>;

  loadTables: () => Promise<PosTable[]>;
  createTable: (table: Omit<PosTable, "id" | "status" | "createdAt">) => Promise<PosTable>;
  updateTable: (table: PosTable) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  setTableStatus: (id: string, status: PosTable["status"], orderId?: string) => Promise<void>;

  loadTaxGroups: () => Promise<TaxGroup[]>;
  createTaxGroup: (group: Omit<TaxGroup, "id">) => Promise<TaxGroup>;
  updateTaxGroup: (group: TaxGroup) => Promise<void>;
  deleteTaxGroup: (id: string) => Promise<void>;

  loadSplitPayments: (saleId: string) => Promise<SplitPaymentEntry[]>;
  saveZReport: (report: any) => Promise<void>;
  loadZReports: () => Promise<any[]>;
}

export const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useDatabase must be used within a DatabaseProvider");
  return ctx;
}
