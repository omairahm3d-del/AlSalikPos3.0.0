import type { SQLiteDatabase } from "expo-sqlite";
import { SEED_PRODUCTS } from "@/types";

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
      barcode TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      vat_rate REAL NOT NULL,
      vat_amount REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL
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
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  try {
    await db.execAsync("ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT NULL");
  } catch {
  }

  try {
    await db.execAsync("ALTER TABLE sales ADD COLUMN invoice_number TEXT NOT NULL DEFAULT ''");
  } catch {
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
        "INSERT INTO products (id, name, category, price, description, color_hex, barcode) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [p.id, p.name, p.category, p.price, p.description, p.colorHex, p.barcode ?? null]
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
