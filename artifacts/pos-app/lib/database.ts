import type { SQLiteDatabase } from "expo-sqlite";
import { SEED_PRODUCTS, SEED_CATEGORIES, SEED_STAFF, SEED_TABLES, SEED_TAX_GROUPS, SEED_CUSTOMERS } from "@/types";

/**
 * Build-time mode lock — same env var used by WorkModeContext and app.config.js.
 * When EXPO_PUBLIC_WORK_MODE is set in eas.json the APK only creates the tables
 * its mode actually needs, keeping the schema small and the intent explicit.
 * Falls back to "standard" for Expo Go dev, the multi-mode preview build, and
 * the desktop installer (none of which set the var).
 */
const BUILD_TIME_MODE = (process.env.EXPO_PUBLIC_WORK_MODE ?? "standard") as
  | "standard"
  | "saloon"
  | "laundry"
  | "retail";

// ---------------------------------------------------------------------------
// Core schema — required by EVERY work mode
// ---------------------------------------------------------------------------
async function initCoreSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    -- Product catalog
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

    -- Sales ledger
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

    -- Sequence generators
    CREATE TABLE IF NOT EXISTS invoice_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_value INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO invoice_counter (id, next_value) VALUES (1, 1);

    CREATE TABLE IF NOT EXISTS order_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_value INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO order_counter (id, next_value) VALUES (1, 1);

    -- App configuration
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    -- CRM
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

    -- Staff
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      pin TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- Tax
    CREATE TABLE IF NOT EXISTS tax_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS split_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL
    );

    -- End-of-day reports
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

    -- Riders: used by standard (delivery orders) and laundry (pickup/delivery)
    CREATE TABLE IF NOT EXISTS riders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      vehicle_info TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- Cash-out / petty-cash log
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      staff_id TEXT DEFAULT NULL,
      staff_name TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_created_idx ON expenses(created_at);

    -- Outbound sync queue (sales push)
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

    -- Catalog outbox (products, categories, customers LWW push)
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

  // Sync event log — created separately so it is idempotent on every open
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

  // Local offline purchasing tables (offline-licensed devices, all modes)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trn_number TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      payment_terms TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_purchases (
      id TEXT PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      reference_number TEXT,
      received_at INTEGER NOT NULL,
      notes TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      product_client_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      vat_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_stock_movements (
      id TEXT PRIMARY KEY,
      product_client_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      delta REAL NOT NULL,
      ref_id TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lsm_product_idx
      ON local_stock_movements(product_client_id, created_at DESC);
  `);
}

// ---------------------------------------------------------------------------
// Standard / Restaurant schema — dine-in tables, held orders, kitchen, modifiers
// ---------------------------------------------------------------------------
async function initStandardSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- Dine-in table management
    CREATE TABLE IF NOT EXISTS pos_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'available',
      current_order_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );

    -- Cart save / dine-in ordering (KOT)
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

    -- Raw ingredient inventory tracking
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

    -- Product modifier groups and options (e.g. "Size", "Extra Cheese")
    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      min_selections INTEGER NOT NULL DEFAULT 0,
      max_selections INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS modifier_options (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_adjustment REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ---------------------------------------------------------------------------
// Saloon schema — appointments, service bundles, prepaid packages
// ---------------------------------------------------------------------------
async function initSaloonSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- Appointment scheduling (stylists / chairs)
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_id TEXT DEFAULT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT DEFAULT '',
      stylist_id TEXT DEFAULT NULL,
      stylist_name TEXT DEFAULT '',
      service_name TEXT DEFAULT '',
      chair_id TEXT DEFAULT NULL,
      chair_name TEXT DEFAULT '',
      appointment_date INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );

    -- Groups of services sold at a single price
    CREATE TABLE IF NOT EXISTS service_bundles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      services_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- Prepaid session packages
    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      total_sessions INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      applicable_service_ids TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_packages (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      package_name TEXT NOT NULL DEFAULT '',
      total_sessions INTEGER NOT NULL DEFAULT 1,
      used_sessions INTEGER NOT NULL DEFAULT 0,
      purchase_sale_id TEXT DEFAULT NULL,
      purchased_at INTEGER NOT NULL,
      expires_at INTEGER DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS cp_customer_idx
      ON customer_packages(customer_id, is_active);
  `);
}

// ---------------------------------------------------------------------------
// Laundry schema — drop-off tickets, line items, ticket counter
// ---------------------------------------------------------------------------
async function initLaundrySchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS laundry_orders (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received',
      promised_at INTEGER NOT NULL,
      order_type TEXT NOT NULL DEFAULT 'drop-off',
      notes TEXT DEFAULT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid_at INTEGER DEFAULT NULL,
      payment_method TEXT DEFAULT NULL,
      sale_id TEXT DEFAULT NULL,
      staff_id TEXT DEFAULT NULL,
      staff_name TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS laundry_ticket_uniq
      ON laundry_orders(ticket_number);
    CREATE INDEX IF NOT EXISTS laundry_status_idx
      ON laundry_orders(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS laundry_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total REAL NOT NULL,
      notes TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS loi_order_idx
      ON laundry_order_items(order_id);

    -- Ticket sequence generator
    CREATE TABLE IF NOT EXISTS laundry_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_value INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO laundry_counter (id, next_value) VALUES (1, 1);
  `);
}

// ---------------------------------------------------------------------------
// Migrations — each wrapped in try/catch so an ALTER on a table that doesn't
// exist in the current mode is silently skipped (same as the original design).
// ---------------------------------------------------------------------------

/** Migrations that apply to tables present in every mode. */
const CORE_MIGRATIONS: string[] = [
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
  // Catalog LWW timestamps — NULL on legacy rows (treated as 0 by comparison)
  "ALTER TABLE products ADD COLUMN updated_at INTEGER DEFAULT NULL",
  "ALTER TABLE categories ADD COLUMN updated_at INTEGER DEFAULT NULL",
  "ALTER TABLE customers ADD COLUMN updated_at INTEGER DEFAULT NULL",
  // Per-product pricing flags
  "ALTER TABLE products ADD COLUMN price_change_allowed INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN vat_inclusive INTEGER NOT NULL DEFAULT 0",
  // Stock tracking flag distinguishes "tracked" from "default 999 untracked"
  "ALTER TABLE products ADD COLUMN stock_tracking INTEGER NOT NULL DEFAULT 0",
  // Active/inactive soft-delete for catalog and CRM
  "ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE customers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
  // Commission percentage per rider/stylist
  "ALTER TABLE riders ADD COLUMN commission_pct REAL NOT NULL DEFAULT 0",
  // Cash numpad: tendered amount and change
  "ALTER TABLE sales ADD COLUMN cash_tendered REAL DEFAULT NULL",
  "ALTER TABLE sales ADD COLUMN change_due REAL DEFAULT NULL",
];

/** Migrations for standard/restaurant-only tables. */
const STANDARD_MIGRATIONS: string[] = [
  // Kitchen Display System status per held order
  "ALTER TABLE held_orders ADD COLUMN kds_status TEXT NOT NULL DEFAULT 'new'",
  // Modifier snapshot on each sale line
  "ALTER TABLE sale_items ADD COLUMN modifiers_json TEXT DEFAULT NULL",
];

/** Migrations for saloon-only tables. */
const SALOON_MIGRATIONS: string[] = [
  // Estimated service duration per product
  "ALTER TABLE products ADD COLUMN duration_minutes INTEGER DEFAULT NULL",
  // Stylist assignment per sale line
  "ALTER TABLE sale_items ADD COLUMN stylist_id TEXT DEFAULT NULL",
  "ALTER TABLE sale_items ADD COLUMN stylist_name TEXT DEFAULT NULL",
  // Package redemption tracking per sale line
  "ALTER TABLE sale_items ADD COLUMN package_redemption_id TEXT DEFAULT NULL",
  // Service bundle breakdown per sale line
  "ALTER TABLE sale_items ADD COLUMN bundle_services_json TEXT DEFAULT NULL",
];

/** Migrations for laundry-only tables. */
const LAUNDRY_MIGRATIONS: string[] = [
  "ALTER TABLE laundry_orders ADD COLUMN rider_id TEXT DEFAULT NULL",
  "ALTER TABLE laundry_orders ADD COLUMN rider_name TEXT DEFAULT NULL",
];

// ---------------------------------------------------------------------------
// Public entry point — called by LicenseContext / DatabaseProvider on open
// ---------------------------------------------------------------------------
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  const workMode = BUILD_TIME_MODE;

  // 1. Schema — core first, then mode-specific tables
  await initCoreSchema(db);
  if (workMode === "standard") await initStandardSchema(db);
  if (workMode === "saloon") await initSaloonSchema(db);
  if (workMode === "laundry") await initLaundrySchema(db);
  // retail: core tables are sufficient

  // 2. Migrations — run all core migrations, then mode-specific ones.
  //    Each is individually try/caught: an ALTER TABLE on a table that
  //    doesn't exist in this mode (e.g. on an upgrade from the old
  //    unified schema) is silently skipped.
  const migrations = [
    ...CORE_MIGRATIONS,
    ...(workMode === "standard" ? STANDARD_MIGRATIONS : []),
    ...(workMode === "saloon" ? SALOON_MIGRATIONS : []),
    ...(workMode === "laundry" ? LAUNDRY_MIGRATIONS : []),
  ];

  for (const sql of migrations) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists or table not present in this mode — expected.
    }
  }

  // 3. One-off idempotent index (not safe in the migrations array because it
  //    has a WHERE clause that SQLite rejects via execAsync with IF NOT EXISTS
  //    on some older versions — keep it isolated with its own try/catch).
  try {
    await db.execAsync(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number) WHERE invoice_number != ''"
    );
  } catch {
    // Already exists.
  }

  // 4. Seed invoice counter to current sales count (first boot only)
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

  // 5. Seed catalog (products + categories + customers) — all modes
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

  // pos_tables only exist in standard mode — seed them only there
  if (workMode === "standard") {
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

// ---------------------------------------------------------------------------
// Utility helpers (unchanged)
// ---------------------------------------------------------------------------

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Generates a tax-invoice number.
 * Single-device format  : INV-20260509-0001
 * Multi-device format   : INV-20260509-C3A1-0001  (deviceCode = last-4 of UID)
 */
export function generateInvoiceNumber(count: number, deviceCode?: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(count + 1).padStart(4, "0");
  return deviceCode
    ? `INV-${y}${m}${d}-${deviceCode}-${seq}`
    : `INV-${y}${m}${d}-${seq}`;
}

/**
 * Generates a short kitchen/order-screen order number.
 * Format: #C3A1-0042
 * Each device has its own sequence so numbers never collide across tablets.
 */
export function generateOrderNumber(count: number, deviceCode?: string): string {
  const seq = String(count + 1).padStart(4, "0");
  return deviceCode ? `#${deviceCode}-${seq}` : `#${seq}`;
}
