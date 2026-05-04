import React, { useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type { BusinessSettings, CartItem, Product, Sale, SaleItem } from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { DatabaseContext } from "./DatabaseCore";

export function NativeDatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      category: string;
      price: number;
      description: string;
      color_hex: string;
      barcode: string | null;
    }>("SELECT * FROM products ORDER BY category, name");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      price: r.price,
      description: r.description ?? "",
      colorHex: r.color_hex ?? "#4F8EF7",
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
    async (items: CartItem[], paymentMethod: string): Promise<Sale> => {
      const subtotal = items.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const vatAmount = subtotal * VAT_RATE;
      const total = subtotal + vatAmount;
      const saleId = generateId();
      const createdAt = Date.now();

      const counterRow = await db.getFirstAsync<{ next_value: number }>(
        "SELECT next_value FROM invoice_counter WHERE id = 1"
      );
      const seq = counterRow?.next_value ?? 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1);
      await db.runAsync(
        "UPDATE invoice_counter SET next_value = next_value + 1 WHERE id = 1"
      );

      await db.runAsync(
        "INSERT INTO sales (id, invoice_number, created_at, subtotal, vat_rate, vat_amount, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [saleId, invoiceNumber, createdAt, subtotal, VAT_RATE, vatAmount, total, paymentMethod]
      );

      for (const item of items) {
        const itemId = generateId();
        const lineTotal = item.product.price * item.quantity;
        await db.runAsync(
          "INSERT INTO sale_items (id, sale_id, product_id, product_name, product_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [itemId, saleId, item.product.id, item.product.name, item.product.price, item.quantity, lineTotal]
        );
      }

      return { id: saleId, invoiceNumber, createdAt, subtotal, vatRate: VAT_RATE, vatAmount, total, paymentMethod };
    },
    [db]
  );

  const loadSales = useCallback(async (): Promise<Sale[]> => {
    const rows = await db.getAllAsync<{
      id: string;
      invoice_number: string;
      created_at: number;
      subtotal: number;
      vat_rate: number;
      vat_amount: number;
      total: number;
      payment_method: string;
    }>("SELECT * FROM sales ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number ?? "",
      createdAt: r.created_at,
      subtotal: r.subtotal,
      vatRate: r.vat_rate,
      vatAmount: r.vat_amount,
      total: r.total,
      paymentMethod: r.payment_method,
    }));
  }, [db]);

  const loadSaleWithItems = useCallback(
    async (saleId: string): Promise<Sale | null> => {
      const sale = await db.getFirstAsync<{
        id: string;
        invoice_number: string;
        created_at: number;
        subtotal: number;
        vat_rate: number;
        vat_amount: number;
        total: number;
        payment_method: string;
      }>("SELECT * FROM sales WHERE id = ?", [saleId]);
      if (!sale) return null;

      const itemRows = await db.getAllAsync<{
        id: string;
        sale_id: string;
        product_id: string;
        product_name: string;
        product_price: number;
        quantity: number;
        line_total: number;
      }>("SELECT * FROM sale_items WHERE sale_id = ?", [saleId]);

      const items: SaleItem[] = itemRows.map((i) => ({
        id: i.id,
        saleId: i.sale_id,
        productId: i.product_id,
        productName: i.product_name,
        productPrice: i.product_price,
        quantity: i.quantity,
        lineTotal: i.line_total,
      }));

      return {
        id: sale.id,
        invoiceNumber: sale.invoice_number ?? "",
        createdAt: sale.created_at,
        subtotal: sale.subtotal,
        vatRate: sale.vat_rate,
        vatAmount: sale.vat_amount,
        total: sale.total,
        paymentMethod: sale.payment_method,
        items,
      };
    },
    [db]
  );

  const loadSalesWithItemsByDateRange = useCallback(
    async (startMs: number, endMs: number): Promise<{ sales: Sale[]; items: SaleItem[] }> => {
      const saleRows = await db.getAllAsync<{
        id: string;
        invoice_number: string;
        created_at: number;
        subtotal: number;
        vat_rate: number;
        vat_amount: number;
        total: number;
        payment_method: string;
      }>("SELECT * FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC", [startMs, endMs]);

      const sales: Sale[] = saleRows.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoice_number ?? "",
        createdAt: r.created_at,
        subtotal: r.subtotal,
        vatRate: r.vat_rate,
        vatAmount: r.vat_amount,
        total: r.total,
        paymentMethod: r.payment_method,
      }));

      if (sales.length === 0) return { sales, items: [] };

      const ids = sales.map((s) => s.id);
      const placeholders = ids.map(() => "?").join(",");
      const itemRows = await db.getAllAsync<{
        id: string;
        sale_id: string;
        product_id: string;
        product_name: string;
        product_price: number;
        quantity: number;
        line_total: number;
      }>(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`, ids);

      const items: SaleItem[] = itemRows.map((i) => ({
        id: i.id,
        saleId: i.sale_id,
        productId: i.product_id,
        productName: i.product_name,
        productPrice: i.product_price,
        quantity: i.quantity,
        lineTotal: i.line_total,
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
      businessName: map.businessName ?? "",
      trn: map.trn ?? "",
      address: map.address ?? "",
      phone: map.phone ?? "",
      email: map.email ?? "",
    };
  }, [db]);

  const saveBusinessSettings = useCallback(
    async (settings: BusinessSettings): Promise<void> => {
      const entries = Object.entries(settings) as [string, string][];
      for (const [key, value] of entries) {
        await db.runAsync(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
          [key, value]
        );
      }
    },
    [db]
  );

  return (
    <DatabaseContext.Provider
      value={{
        loadProducts, createProduct, updateProduct, deleteProduct,
        saveSale, loadSales, loadSaleWithItems, loadSalesWithItemsByDateRange,
        loadBusinessSettings, saveBusinessSettings,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
