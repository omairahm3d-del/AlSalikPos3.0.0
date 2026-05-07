import type { SQLiteDatabase } from "expo-sqlite";
import { SEED_PRODUCTS, SEED_CATEGORIES, SEED_STAFF, SEED_TABLES, SEED_TAX_GROUPS, SEED_CUSTOMERS } from "@/types";

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

    -- Phase 3b: outbound sync queue. One row per (entity_type, entity_id) that
    -- still needs to be pushed to the cloud. The actual data lives in the
    -- existing tables (sales, sale_items, ...); this is just bookkeeping.
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      enqueued_at INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_entity_uniq
      ON sync_queue(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS sync_queue_status_idx
      ON sync_queue(status, enqueued_at);

    -- Phase 3c: catalog outbox. Separate from sync_queue because catalog
    -- semantics differ: each row is a snapshot (latest payload for an entity)
    -- and re-edits OVERWRITE the existing outbox row instead of appending.
    -- The payload + deleted flag are captured at enqueue time so deletes can
    -- still be pushed after the source row is gone from the local table.
    CREATE TABLE IF NOT EXISTS catalog_outbox (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      enqueued_at INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      last_error TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_outbox_entity_uniq
      ON catalog_outbox(entity_type, entity_id);
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
    // Phase 3c: catalog LWW timestamp. NULL on legacy rows (treated as 0
    // by the comparison logic so any real cloud edit wins).
    "ALTER TABLE products ADD COLUMN updated_at INTEGER DEFAULT NULL",
    "ALTER TABLE categories ADD COLUMN updated_at INTEGER DEFAULT NULL",
    // Phase 3d: customers join the catalog sync streams. NULL on legacy
    // rows (treated as 0 by the LWW comparison so any real cloud edit
    // wins).
    "ALTER TABLE customers ADD COLUMN updated_at INTEGER DEFAULT NULL",
    // Per-product flags powering the in-cart "edit price" prompt and the
    // VAT-inclusive vs VAT-on-top math. Both default to 0 (off) so legacy
    // rows behave exactly as before this feature shipped.
    "ALTER TABLE products ADD COLUMN price_change_allowed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN vat_inclusive INTEGER NOT NULL DEFAULT 0",
    // stock_tracking distinguishes "actively tracked" (1) from "default 999 untracked" (0).
    // Without this flag there is no way to tell the default 999 from a real 999-unit stock.
    "ALTER TABLE products ADD COLUMN stock_tracking INTEGER NOT NULL DEFAULT 0",
  ];

  // Sync event log. Append-only ring buffer (capped to 200 rows by the
  // insertSyncLog helper). Created outside migrations so it is idempotent.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      attempted INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_log_at_idx ON sync_log(at DESC);
  `);

  // Cash-out / petty-cash log. Created outside the migrations array so it
  // executes via execAsync (CREATE TABLE IF NOT EXISTS is idempotent).
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      staff_id TEXT DEFAULT NULL,
      staff_name TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_created_idx ON expenses(created_at);
  `);

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
    for (const tg of SEED_TAX_GROUPS) {
      await db.runAsync(
        "INSERT INTO tax_groups (id, name, rate) VALUES (?, ?, ?)",
        [tg.id, tg.name, tg.rate]
      );
    }
  }

  // Seed a default admin so the user can log in on first install.
  // Name "Admin", PIN "1234". They can change/delete from Back Office.
  const staffCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM staff"
  );
  if (!staffCount || staffCount.count === 0) {
    const now = Date.now();
    for (const s of SEED_STAFF) {
      await db.runAsync(
        "INSERT INTO staff (id, name, role, pin, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
        [s.id, s.name, s.role, s.pin, now]
      );
    }
  }

  const tableCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pos_tables"
  );
  if (!tableCount || tableCount.count === 0) {
    const now = Date.now();
    for (const t of SEED_TABLES) {
      await db.runAsync(
        "INSERT INTO pos_tables (id, name, capacity, status, created_at) VALUES (?, ?, ?, 'available', ?)",
        [t.id, t.name, t.capacity, now]
      );
    }
  }

  const custCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM customers"
  );
  if (!custCount || custCount.count === 0) {
    const now = Date.now();
    for (const c of SEED_CUSTOMERS) {
      await db.runAsync(
        "INSERT INTO customers (id, name, phone, email, company, credit_balance, loyalty_points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [c.id, c.name, c.phone, c.email, c.company, c.creditBalance, c.loyaltyPoints, now]
      );
    }
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
