import React, { useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type { BusinessSettings, CartItem, CreditPayment, Customer, Product, Sale, SaleItem } from "@/types";
import { VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { DatabaseContext } from "./DatabaseCore";

export function NativeDatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const rows = await db.getAllAsync<{
      id: string; name: string; category: string; price: number;
      description: string; color_hex: string; barcode: string | null;
    }>("SELECT * FROM products ORDER BY category, name");
    return rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, price: r.price,
      description: r.description ?? "", colorHex: r.color_hex ?? "#4F8EF7",
      barcode: r.barcode ?? undefined,
    }));
  }, [db]);

  const createProduct = useCallback(
    async (product: Omit<Product, "id">): Promise<Product> => {
      const id = generateId();
      await db.runAsync(
        "INSERT INTO products (id, name, category, price, description, color_hex, barcode) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null]
      );
      return { ...product, id };
    },
    [db]
  );

  const updateProduct = useCallback(
    async (product: Product): Promise<void> => {
      await db.runAsync(
        "UPDATE products SET name = ?, category = ?, price = ?, description = ?, color_hex = ?, barcode = ? WHERE id = ?",
        [product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null, product.id]
      );
    },
    [db]
  );

  const deleteProduct = useCallback(
    async (id: string): Promise<void> => {
      await db.runAsync("DELETE FROM products WHERE id = ?", [id]);
    },
    [db]
  );

  const saveSale = useCallback(
    async (items: CartItem[], paymentMethod: string, customerId?: string, customerName?: string): Promise<Sale> => {
      if (paymentMethod === "Credit" && !customerId) {
        throw new Error("Credit sales require a customer");
      }

      const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const vatAmount = subtotal * VAT_RATE;
      const total = subtotal + vatAmount;
      const saleId = generateId();
      const createdAt = Date.now();

      return await db.withExclusiveTransactionAsync(async (tx) => {
        const counterRow = await tx.getFirstAsync<{ next_value: number }>(
          "SELECT next_value FROM invoice_counter WHERE id = 1"
        );
        const seq = counterRow?.next_value ?? 1;
        const invoiceNumber = generateInvoiceNumber(seq - 1);
        await tx.runAsync("UPDATE invoice_counter SET next_value = next_value + 1 WHERE id = 1");

        await tx.runAsync(
          "INSERT INTO sales (id, invoice_number, created_at, subtotal, vat_rate, vat_amount, total, payment_method, customer_id, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [saleId, invoiceNumber, createdAt, subtotal, VAT_RATE, vatAmount, total, paymentMethod, customerId ?? null, customerName ?? null]
        );

        for (const item of items) {
          const itemId = generateId();
          const lineTotal = item.product.price * item.quantity;
          await tx.runAsync(
            "INSERT INTO sale_items (id, sale_id, product_id, product_name, product_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [itemId, saleId, item.product.id, item.product.name, item.product.price, item.quantity, lineTotal]
          );
        }

        if (paymentMethod === "Credit" && customerId) {
          const result = await tx.runAsync(
            "UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?",
            [total, customerId]
          );
          if (result.changes === 0) {
            throw new Error("Customer not found");
          }
        }

        return { id: saleId, invoiceNumber, createdAt, subtotal, vatRate: VAT_RATE, vatAmount, total, paymentMethod, customerId, customerName };
      });
    },
    [db]
  );

  const loadSales = useCallback(async (): Promise<Sale[]> => {
    const rows = await db.getAllAsync<{
      id: string; invoice_number: string; created_at: number; subtotal: number;
      vat_rate: number; vat_amount: number; total: number; payment_method: string;
      customer_id: string | null; customer_name: string | null;
    }>("SELECT * FROM sales ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id, invoiceNumber: r.invoice_number ?? "", createdAt: r.created_at,
      subtotal: r.subtotal, vatRate: r.vat_rate, vatAmount: r.vat_amount,
      total: r.total, paymentMethod: r.payment_method,
      customerId: r.customer_id ?? undefined, customerName: r.customer_name ?? undefined,
    }));
  }, [db]);

  const loadSaleWithItems = useCallback(
    async (saleId: string): Promise<Sale | null> => {
      const sale = await db.getFirstAsync<{
        id: string; invoice_number: string; created_at: number; subtotal: number;
        vat_rate: number; vat_amount: number; total: number; payment_method: string;
        customer_id: string | null; customer_name: string | null;
      }>("SELECT * FROM sales WHERE id = ?", [saleId]);
      if (!sale) return null;

      const itemRows = await db.getAllAsync<{
        id: string; sale_id: string; product_id: string; product_name: string;
        product_price: number; quantity: number; line_total: number;
      }>("SELECT * FROM sale_items WHERE sale_id = ?", [saleId]);

      const items: SaleItem[] = itemRows.map((i) => ({
        id: i.id, saleId: i.sale_id, productId: i.product_id,
        productName: i.product_name, productPrice: i.product_price,
        quantity: i.quantity, lineTotal: i.line_total,
      }));

      return {
        id: sale.id, invoiceNumber: sale.invoice_number ?? "", createdAt: sale.created_at,
        subtotal: sale.subtotal, vatRate: sale.vat_rate, vatAmount: sale.vat_amount,
        total: sale.total, paymentMethod: sale.payment_method,
        customerId: sale.customer_id ?? undefined, customerName: sale.customer_name ?? undefined,
        items,
      };
    },
    [db]
  );

  const loadSalesWithItemsByDateRange = useCallback(
    async (startMs: number, endMs: number): Promise<{ sales: Sale[]; items: SaleItem[] }> => {
      const saleRows = await db.getAllAsync<{
        id: string; invoice_number: string; created_at: number; subtotal: number;
        vat_rate: number; vat_amount: number; total: number; payment_method: string;
        customer_id: string | null; customer_name: string | null;
      }>("SELECT * FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC", [startMs, endMs]);

      const sales: Sale[] = saleRows.map((r) => ({
        id: r.id, invoiceNumber: r.invoice_number ?? "", createdAt: r.created_at,
        subtotal: r.subtotal, vatRate: r.vat_rate, vatAmount: r.vat_amount,
        total: r.total, paymentMethod: r.payment_method,
        customerId: r.customer_id ?? undefined, customerName: r.customer_name ?? undefined,
      }));

      if (sales.length === 0) return { sales, items: [] };

      const ids = sales.map((s) => s.id);
      const placeholders = ids.map(() => "?").join(",");
      const itemRows = await db.getAllAsync<{
        id: string; sale_id: string; product_id: string; product_name: string;
        product_price: number; quantity: number; line_total: number;
      }>(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`, ids);

      const items: SaleItem[] = itemRows.map((i) => ({
        id: i.id, saleId: i.sale_id, productId: i.product_id,
        productName: i.product_name, productPrice: i.product_price,
        quantity: i.quantity, lineTotal: i.line_total,
      }));

      return { sales, items };
    },
    [db]
  );

  const loadBusinessSettings = useCallback(async (): Promise<BusinessSettings> => {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('businessName', 'trn', 'address', 'phone', 'email')"
    );
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return {
      businessName: map.businessName ?? "", trn: map.trn ?? "",
      address: map.address ?? "", phone: map.phone ?? "", email: map.email ?? "",
    };
  }, [db]);

  const saveBusinessSettings = useCallback(
    async (settings: BusinessSettings): Promise<void> => {
      const entries = Object.entries(settings) as [string, string][];
      for (const [key, value] of entries) {
        await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
      }
    },
    [db]
  );

  const loadCustomers = useCallback(async (): Promise<Customer[]> => {
    const rows = await db.getAllAsync<{
      id: string; name: string; phone: string; email: string;
      company: string; credit_balance: number; created_at: number;
    }>("SELECT * FROM customers ORDER BY name ASC");
    return rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone ?? "", email: r.email ?? "",
      company: r.company ?? "", creditBalance: r.credit_balance, createdAt: r.created_at,
    }));
  }, [db]);

  const createCustomer = useCallback(
    async (customer: Omit<Customer, "id" | "creditBalance" | "createdAt">): Promise<Customer> => {
      const id = generateId();
      const createdAt = Date.now();
      await db.runAsync(
        "INSERT INTO customers (id, name, phone, email, company, credit_balance, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        [id, customer.name, customer.phone, customer.email, customer.company, createdAt]
      );
      return { ...customer, id, creditBalance: 0, createdAt };
    },
    [db]
  );

  const updateCustomer = useCallback(
    async (customer: Customer): Promise<void> => {
      await db.runAsync(
        "UPDATE customers SET name = ?, phone = ?, email = ?, company = ? WHERE id = ?",
        [customer.name, customer.phone, customer.email, customer.company, customer.id]
      );
    },
    [db]
  );

  const deleteCustomer = useCallback(
    async (id: string): Promise<void> => {
      const customer = await db.getFirstAsync<{ credit_balance: number }>(
        "SELECT credit_balance FROM customers WHERE id = ?",
        [id]
      );
      if (customer && customer.credit_balance > 0) {
        throw new Error("Cannot delete customer with outstanding balance");
      }
      await db.runAsync("DELETE FROM customers WHERE id = ?", [id]);
    },
    [db]
  );

  const recordCreditPayment = useCallback(
    async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
      if (amount <= 0) throw new Error("Payment amount must be positive");

      const id = generateId();
      const createdAt = Date.now();

      return await db.withExclusiveTransactionAsync(async (tx) => {
        const customer = await tx.getFirstAsync<{ credit_balance: number }>(
          "SELECT credit_balance FROM customers WHERE id = ?",
          [customerId]
        );
        if (!customer) throw new Error("Customer not found");
        if (amount > customer.credit_balance) throw new Error("Payment exceeds outstanding balance");

        await tx.runAsync(
          "INSERT INTO credit_payments (id, customer_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?)",
          [id, customerId, amount, note, createdAt]
        );
        await tx.runAsync(
          "UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?",
          [amount, customerId]
        );

        return { id, customerId, amount, note, createdAt };
      });
    },
    [db]
  );

  const loadCreditPayments = useCallback(
    async (customerId: string): Promise<CreditPayment[]> => {
      const rows = await db.getAllAsync<{
        id: string; customer_id: string; amount: number; note: string; created_at: number;
      }>("SELECT * FROM credit_payments WHERE customer_id = ? ORDER BY created_at DESC", [customerId]);
      return rows.map((r) => ({
        id: r.id, customerId: r.customer_id, amount: r.amount,
        note: r.note ?? "", createdAt: r.created_at,
      }));
    },
    [db]
  );

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
