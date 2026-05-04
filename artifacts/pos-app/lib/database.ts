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
      created_at INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      vat_rate REAL NOT NULL,
      vat_amount REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total REAL NOT NULL
    );
  `);

  // Add barcode column if missing (migration for existing DBs)
  try {
    await db.execAsync("ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT NULL");
  } catch {
    // column already exists — safe to ignore
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
