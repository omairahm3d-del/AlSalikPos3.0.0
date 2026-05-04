import type { SQLiteDatabase } from "expo-sqlite";
import { SEED_PRODUCTS, SEED_CATEGORIES } from "@/types";

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT DEFAULT '',
      color_hex TEXT DEFAULT '#4F8EF7',
      barcode TEXT DEFAULT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 999,
      tax_group_id TEXT DEFAULT NULL,
      low_stock_threshold INTEGER NOT NULL DEFAULT 10,
      image_uri TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color_hex TEXT DEFAULT '#4F8EF7',
      image_uri TEXT DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      vat_rate REAL NOT NULL,
      vat_amount REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      customer_id TEXT DEFAULT NULL,
      customer_name TEXT DEFAULT NULL,
      staff_id TEXT DEFAULT NULL,
      staff_name TEXT DEFAULT NULL,
      table_id TEXT DEFAULT NULL,
      table_name TEXT DEFAULT NULL,
      discount_type TEXT DEFAULT NULL,
      discount_value REAL DEFAULT NULL,
      discount_amount REAL DEFAULT 0,
      is_refund INTEGER DEFAULT 0,
      original_sale_id TEXT DEFAULT NULL,
      loyalty_points_earned INTEGER DEFAULT 0,
      loyalty_points_redeemed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoice_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_value INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO invoice_counter (id, next_value) VALUES (1, 1);

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total REAL NOT NULL,
      discount_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      company TEXT DEFAULT '',
      credit_balance REAL NOT NULL DEFAULT 0,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_payments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      pin TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pos_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'available',
      current_order_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tax_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS split_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS z_reports (
      id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL,
      opening_cash REAL NOT NULL DEFAULT 0,
      closing_cash REAL NOT NULL DEFAULT 0,
      total_sales REAL NOT NULL DEFAULT 0,
      total_refunds REAL NOT NULL DEFAULT 0,
      net_sales REAL NOT NULL DEFAULT 0,
      total_vat REAL NOT NULL DEFAULT 0,
      total_discount REAL NOT NULL DEFAULT 0,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      refund_count INTEGER NOT NULL DEFAULT 0,
      data_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS riders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      vehicle_info TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS held_orders (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      order_type TEXT NOT NULL DEFAULT 'dine-in',
      staff_id TEXT DEFAULT NULL,
      staff_name TEXT DEFAULT NULL,
      customer_id TEXT DEFAULT NULL,
      customer_name TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS held_order_items (
      id TEXT PRIMARY KEY,
      held_order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      color_hex TEXT DEFAULT '#4F8EF7',
      category TEXT DEFAULT '',
      tax_rate REAL DEFAULT NULL,
      discount_type TEXT DEFAULT NULL,
      discount_value REAL DEFAULT NULL,
      discount_amount REAL DEFAULT 0,
      image_uri TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs',
      stock_quantity REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      low_stock_threshold REAL NOT NULL DEFAULT 10,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1
    );
  `);

  const migrations: string[] = [
    "ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN invoice_number TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE sales ADD COLUMN customer_id TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN customer_name TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN staff_id TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN staff_name TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN table_id TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN table_name TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN discount_type TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN discount_value REAL DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN discount_amount REAL DEFAULT 0",
    "ALTER TABLE sales ADD COLUMN is_refund INTEGER DEFAULT 0",
    "ALTER TABLE sales ADD COLUMN original_sale_id TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0",
    "ALTER TABLE sales ADD COLUMN loyalty_points_redeemed INTEGER DEFAULT 0",
    "ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 999",
    "ALTER TABLE products ADD COLUMN tax_group_id TEXT DEFAULT NULL",
    "ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10",
    "ALTER TABLE customers ADD COLUMN loyalty_points INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE sale_items ADD COLUMN discount_amount REAL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN image_uri TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN order_type TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN rider_id TEXT DEFAULT NULL",
    "ALTER TABLE sales ADD COLUMN rider_name TEXT DEFAULT NULL",
    "ALTER TABLE products ADD COLUMN printer_id TEXT DEFAULT NULL",
  ];

  for (const sql of migrations) {
    try {
      await db.execAsync(sql);
    } catch {
    }
  }

  try {
    await db.execAsync("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number) WHERE invoice_number != ''");
  } catch {
  }

  const counterExists = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM invoice_counter"
  );
  if (!counterExists || counterExists.count === 0) {
    const salesCount = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sales"
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO invoice_counter (id, next_value) VALUES (1, ?)",
      [(salesCount?.count ?? 0) + 1]
    );
  }

  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM products"
  );
  if (!row || row.count === 0) {
    for (const p of SEED_PRODUCTS) {
      await db.runAsync(
        "INSERT INTO products (id, name, category, price, description, color_hex, barcode, stock_quantity, tax_group_id, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [p.id, p.name, p.category, p.price, p.description, p.colorHex, p.barcode ?? null, p.stockQuantity, p.taxGroupId ?? null, p.lowStockThreshold]
      );
    }
  }

  const defaultTax = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM tax_groups"
  );
  if (!defaultTax || defaultTax.count === 0) {
    await db.runAsync(
      "INSERT INTO tax_groups (id, name, rate) VALUES (?, ?, ?)",
      ["tg_default", "Standard VAT (5%)", 0.05]
    );
  }

  const catCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM categories"
  );
  if (!catCount || catCount.count === 0) {
    for (const c of SEED_CATEGORIES) {
      await db.runAsync(
        "INSERT INTO categories (id, name, color_hex, image_uri, sort_order) VALUES (?, ?, ?, ?, ?)",
        [c.id, c.name, c.colorHex, c.imageUri ?? null, c.sortOrder]
      );
    }
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function generateInvoiceNumber(count: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(count + 1).padStart(4, "0");
  return `INV-${y}${m}${d}-${seq}`;
}
