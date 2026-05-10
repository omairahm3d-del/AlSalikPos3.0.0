import React, { useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type {
  Appointment, BackupData, BusinessSettings, CartItem, Category, ClearDataOptions, CreditPayment, Customer,
  Expense, HeldOrder, HeldOrderItem, Ingredient, ModifierGroup, PosTable, Product,
  RecipeIngredient, Rider, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, VAT_RATE } from "@/types";
import { computeLineNetVat } from "./CartContext";
import { generateId, generateInvoiceNumber, generateOrderNumber } from "@/lib/database";
import { notifySyncQueueChanged } from "@/lib/syncEvents";
import { clearOwningCompanyId, getDeviceCode } from "@/lib/saasStorage";
import { DatabaseContext, type CatalogApplyInput, type CatalogEntityType, type CatalogOutboxItem, type CatalogOutboxRow, type CatalogResultUpdate, type LocalPurchase, type LocalPurchaseItem, type LocalStockMovement, type LocalSupplier, type SaleOptions, type SyncEntityType, type SyncLogEntry, type SyncLogKind, type SyncQueueItem, type SyncQueueRow, type SyncResultUpdate } from "./DatabaseCore";

export function NativeDatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM products ORDER BY category, name");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, category: r.category, price: r.price,
      description: r.description ?? "", colorHex: r.color_hex ?? "#4F8EF7",
      barcode: r.barcode ?? undefined, stockQuantity: r.stock_quantity ?? 999,
      stockTracked: r.stock_tracking === 1,
      taxGroupId: r.tax_group_id ?? undefined, lowStockThreshold: r.low_stock_threshold ?? 10,
      imageUri: r.image_uri ?? undefined, printerId: r.printer_id ?? undefined,
      priceChangeAllowed: r.price_change_allowed === 1,
      vatInclusive: r.vat_inclusive === 1,
      updatedAt: r.updated_at ?? undefined,
      durationMinutes: r.duration_minutes ?? undefined,
      isActive: r.is_active !== 0,
    }));
  }, [db]);

  const createProduct = useCallback(async (product: Omit<Product, "id">): Promise<Product> => {
    const id = generateId();
    const updatedAt = Date.now();
    const created: Product = { ...product, id, updatedAt };
    // Atomic: insert + enqueue catalog push in one tx so the cloud never
    // misses a creation that survived the local commit.
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "INSERT INTO products (id, name, category, price, description, color_hex, barcode, stock_quantity, stock_tracking, tax_group_id, low_stock_threshold, image_uri, printer_id, price_change_allowed, vat_inclusive, duration_minutes, updated_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null, product.stockQuantity, product.stockTracked ? 1 : 0, product.taxGroupId ?? null, product.lowStockThreshold, product.imageUri ?? null, product.printerId ?? null, product.priceChangeAllowed ? 1 : 0, product.vatInclusive ? 1 : 0, product.durationMinutes ?? null, updatedAt, product.isActive === false ? 0 : 1]
      );
      await enqueueCatalogTx(tx, "product", id, created, false, updatedAt);
    });
    return created;
  }, [db]);

  const updateProduct = useCallback(async (product: Product): Promise<void> => {
    const updatedAt = Date.now();
    const next: Product = { ...product, updatedAt };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "UPDATE products SET name=?, category=?, price=?, description=?, color_hex=?, barcode=?, stock_quantity=?, stock_tracking=?, tax_group_id=?, low_stock_threshold=?, image_uri=?, printer_id=?, price_change_allowed=?, vat_inclusive=?, duration_minutes=?, updated_at=?, is_active=? WHERE id=?",
        [product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null, product.stockQuantity, product.stockTracked ? 1 : 0, product.taxGroupId ?? null, product.lowStockThreshold, product.imageUri ?? null, product.printerId ?? null, product.priceChangeAllowed ? 1 : 0, product.vatInclusive ? 1 : 0, product.durationMinutes ?? null, updatedAt, product.isActive === false ? 0 : 1, product.id]
      );
      await enqueueCatalogTx(tx, "product", product.id, next, false, updatedAt);
    });
  }, [db]);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    const updatedAt = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("DELETE FROM products WHERE id=?", [id]);
      // Tombstone payload only needs the id; other devices already have
      // (or will pull) the rest. Keeping it minimal saves bandwidth.
      await enqueueCatalogTx(tx, "product", id, { id }, true, updatedAt);
    });
  }, [db]);

  const updateStock = useCallback(async (productId: string, delta: number): Promise<void> => {
    // When receiving stock for the first time (stock_tracking=0), SET the
    // quantity to `delta` rather than adding to the meaningless 999 default.
    // Subsequent calls (stock_tracking=1) accumulate normally.
    await db.runAsync(
      `UPDATE products SET
         stock_quantity = CASE WHEN stock_tracking = 0 THEN ? ELSE MAX(0, stock_quantity + ?) END,
         stock_tracking = 1
       WHERE id=?`,
      [delta, delta, productId]
    );
  }, [db]);

  const saveSale = useCallback(async (items: CartItem[], options: SaleOptions): Promise<Sale> => {
    const { paymentMethod, orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName, discountType, discountValue, discountAmount: orderDiscount, loyaltyPointsRedeemed, splitPayments, cashTendered, customerCreditBalance } = options;

    if (paymentMethod === "Credit" && !customerId) throw new Error("Credit sales require a customer");

    // Per-line totals respect the per-product `vatInclusive` flag and any
    // `vatEnabled=false` business setting (taxRate already 0 in that case).
    // We compute net + vat per line first, then apply the order-level
    // discount as a uniform ratio to each line so VAT scales with it.
    const lineCalcs = items.map(computeLineNetVat);
    let netSum = 0;
    let vatSum = 0;
    let grossSum = 0;
    for (const c of lineCalcs) { netSum += c.net; vatSum += c.vat; grossSum += c.gross; }
    const orderDiscAmt = orderDiscount ?? 0;
    const grossAfterOrderDisc = Math.max(0, grossSum - orderDiscAmt);
    const ratio = grossSum > 0 ? grossAfterOrderDisc / grossSum : 0;
    const subtotal = netSum * ratio;
    const vatAmount = vatSum * ratio;
    const total = subtotal + vatAmount;
    const saleId = generateId();
    const createdAt = Date.now();
    // Resolve the device code before entering the SQLite transaction (async
    // operations cannot be awaited inside withExclusiveTransactionAsync).
    const deviceCode = await getDeviceCode();

    // Capture the result through a closure — expo-sqlite's
    // withExclusiveTransactionAsync is typed `() => Promise<void>`.
    let savedSale: Sale | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const counterRow = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM invoice_counter WHERE id=1");
      const seq = counterRow?.next_value ?? 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1, deviceCode);
      await tx.runAsync("UPDATE invoice_counter SET next_value=next_value+1 WHERE id=1");

      const orderCounterRow = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM order_counter WHERE id=1");
      const orderSeq = orderCounterRow?.next_value ?? 1;
      const orderNumber = generateOrderNumber(orderSeq - 1, deviceCode);
      await tx.runAsync("UPDATE order_counter SET next_value=next_value+1 WHERE id=1");

      const pointsEarned = customerId ? Math.floor(total) : 0;
      const effectiveVatRate = subtotal > 0 ? vatAmount / subtotal : VAT_RATE;

      const changeDue = paymentMethod === "Cash" && (cashTendered ?? 0) > 0
        ? Math.max(0, (cashTendered ?? 0) - total)
        : null;

      await tx.runAsync(
        `INSERT INTO sales (id, invoice_number, created_at, subtotal, vat_rate, vat_amount, total, payment_method,
         order_type, customer_id, customer_name, staff_id, staff_name, table_id, table_name,
         rider_id, rider_name, discount_type, discount_value, discount_amount, is_refund, original_sale_id,
         loyalty_points_earned, loyalty_points_redeemed, cash_tendered, change_due) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?,?,?)`,
        [saleId, invoiceNumber, createdAt, subtotal, effectiveVatRate, vatAmount, total, paymentMethod,
         orderType ?? null, customerId ?? null, customerName ?? null, staffId ?? null, staffName ?? null,
         tableId ?? null, tableName ?? null, riderId ?? null, riderName ?? null,
         discountType ?? null, discountValue ?? null, orderDiscAmt, pointsEarned, loyaltyPointsRedeemed ?? 0,
         (cashTendered != null && cashTendered > 0) ? cashTendered : null, changeDue ?? null]
      );

      for (const item of items) {
        const itemId = generateId();
        const effectiveUnitPrice = item.product.price + (item.modifierTotal ?? 0);
        const lineTotal = effectiveUnitPrice * item.quantity - (item.discountAmount ?? 0);
        const modifiersJson = item.selectedModifiers?.length ? JSON.stringify(item.selectedModifiers) : null;
        await tx.runAsync(
          "INSERT INTO sale_items (id, sale_id, product_id, product_name, product_price, quantity, line_total, discount_amount, stylist_id, stylist_name, modifiers_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [itemId, saleId, item.product.id, item.product.name, item.product.price, item.quantity, lineTotal, item.discountAmount ?? 0, item.stylistId ?? null, item.stylistName ?? null, modifiersJson]
        );
        // Only deduct stock for products the merchant is tracking
        // (stock_tracking=1). Untracked products (default stock_tracking=0)
        // are treated as infinite-stock and never decremented.
        // When allowNegativeStock is true (default) we let quantity go below
        // zero; otherwise clamp with MAX(0, ...) so the device ledger never
        // shows negative values.
        const clamp = options.allowNegativeStock === false;
        await tx.runAsync(
          clamp
            ? "UPDATE products SET stock_quantity=MAX(0,stock_quantity-?) WHERE id=? AND stock_tracking=1"
            : "UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND stock_tracking=1",
          [item.quantity, item.product.id]
        );
      }

      if (splitPayments && splitPayments.length > 0) {
        for (const sp of splitPayments) {
          await tx.runAsync("INSERT INTO split_payments (id, sale_id, method, amount) VALUES (?,?,?,?)", [generateId(), saleId, sp.method, sp.amount]);
        }
      }

      if (paymentMethod === "Credit" && customerId) {
        const res = await tx.runAsync("UPDATE customers SET credit_balance=credit_balance+? WHERE id=?", [total, customerId]);
        if (res.changes === 0) throw new Error("Customer not found");
      }

      if (customerId && pointsEarned > 0) {
        await tx.runAsync("UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?", [pointsEarned, customerId]);
      }
      if (customerId && (loyaltyPointsRedeemed ?? 0) > 0) {
        await tx.runAsync("UPDATE customers SET loyalty_points=loyalty_points-? WHERE id=?", [loyaltyPointsRedeemed ?? 0, customerId]);
      }

      // Phase 3d: any sales-driven customer mutation (credit balance or
      // loyalty change) needs to ride the catalog sync to the cloud.
      // Bump updated_at and snapshot the post-mutation row into the
      // catalog outbox so the SyncContext loop pushes it. Inside the
      // same tx so a sale never commits without its customer-sync row.
      const customerTouched =
        customerId &&
        (paymentMethod === "Credit" || pointsEarned > 0 || (loyaltyPointsRedeemed ?? 0) > 0);
      if (customerTouched) {
        await tx.runAsync("UPDATE customers SET updated_at=? WHERE id=?", [createdAt, customerId]);
        const cu = await tx.getFirstAsync<{
          id: string; name: string; phone: string | null; email: string | null;
          company: string | null; credit_balance: number; loyalty_points: number | null;
          created_at: number;
        }>(
          "SELECT id, name, phone, email, company, credit_balance, loyalty_points, created_at FROM customers WHERE id=?",
          [customerId!]
        );
        if (cu) {
          const updatedCustomer: Customer = {
            id: cu.id, name: cu.name, phone: cu.phone ?? "", email: cu.email ?? "",
            company: cu.company ?? "", creditBalance: cu.credit_balance,
            loyaltyPoints: cu.loyalty_points ?? 0, createdAt: cu.created_at,
            updatedAt: createdAt,
          };
          await enqueueCatalogTx(tx, "customer", cu.id, updatedCustomer, false, createdAt);
        }
      }

      if (tableId) {
        await tx.runAsync("UPDATE pos_tables SET status='available', current_order_id=NULL WHERE id=?", [tableId]);
        await tx.runAsync("DELETE FROM held_order_items WHERE held_order_id IN (SELECT id FROM held_orders WHERE table_id=?)", [tableId]);
        await tx.runAsync("DELETE FROM held_orders WHERE table_id=?", [tableId]);
      }

      // Enqueue for cloud sync inside the same transaction so a sale is never
      // saved without a corresponding queue entry.
      await tx.runAsync(
        "INSERT OR IGNORE INTO sync_queue (id, entity_type, entity_id, enqueued_at, status) VALUES (?, 'sale', ?, ?, 'pending')",
        [generateId(), saleId, createdAt]
      );
      // Wake the SyncContext loop. If the tx rolls back the wake is a
      // harmless no-op (drain finds nothing); the alternative — waiting
      // for a 30s idle tick — delays revenue data leaving the device.
      notifySyncQueueChanged();

      const recipes = await tx.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>(
        "SELECT * FROM recipe_ingredients"
      );
      for (const item of items) {
        const itemRecipes = recipes.filter((r) => r.product_id === item.product.id);
        for (const ri of itemRecipes) {
          await tx.runAsync(
            "UPDATE ingredients SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id=?",
            [ri.quantity * item.quantity, ri.ingredient_id]
          );
        }
      }

      savedSale = {
        id: saleId, invoiceNumber, orderNumber, createdAt, subtotal, vatRate: effectiveVatRate, vatAmount, total, paymentMethod,
        orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName,
        discountType, discountValue, discountAmount: orderDiscAmt,
        loyaltyPointsEarned: pointsEarned, loyaltyPointsRedeemed: loyaltyPointsRedeemed ?? 0,
        splitPayments,
        cashTendered: (cashTendered ?? 0) > 0 ? cashTendered : undefined,
        changeDue: changeDue !== null ? changeDue : undefined,
        customerCreditBalance: customerCreditBalance !== undefined ? customerCreditBalance : undefined,
      };
    });
    if (!savedSale) throw new Error("Sale transaction did not complete");
    return savedSale;
  }, [db]);

  const mapSaleRow = (r: any): Sale => ({
    id: r.id, invoiceNumber: r.invoice_number ?? "", createdAt: r.created_at,
    subtotal: r.subtotal, vatRate: r.vat_rate, vatAmount: r.vat_amount,
    total: r.total, paymentMethod: r.payment_method,
    orderType: r.order_type ?? undefined,
    customerId: r.customer_id ?? undefined, customerName: r.customer_name ?? undefined,
    staffId: r.staff_id ?? undefined, staffName: r.staff_name ?? undefined,
    tableId: r.table_id ?? undefined, tableName: r.table_name ?? undefined,
    riderId: r.rider_id ?? undefined, riderName: r.rider_name ?? undefined,
    discountType: r.discount_type ?? undefined, discountValue: r.discount_value ?? undefined,
    discountAmount: r.discount_amount ?? 0,
    isRefund: r.is_refund === 1, originalSaleId: r.original_sale_id ?? undefined,
    loyaltyPointsEarned: r.loyalty_points_earned ?? 0,
    loyaltyPointsRedeemed: r.loyalty_points_redeemed ?? 0,
    cashTendered: r.cash_tendered ?? undefined,
    changeDue: r.change_due ?? undefined,
  });

  const mapItemRow = (i: any): SaleItem => {
    const modifiers = i.modifiers_json ? JSON.parse(i.modifiers_json) : undefined;
    return {
      id: i.id, saleId: i.sale_id, productId: i.product_id,
      productName: i.product_name, productPrice: i.product_price,
      quantity: i.quantity, lineTotal: i.line_total, discountAmount: i.discount_amount ?? 0,
      stylistId: i.stylist_id ?? undefined, stylistName: i.stylist_name ?? undefined,
      modifiers,
      modifierTotal: modifiers
        ? modifiers.reduce((s: number, m: { priceAdjustment: number }) => s + m.priceAdjustment, 0)
        : undefined,
    };
  };

  const loadSales = useCallback(async (): Promise<Sale[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM sales ORDER BY created_at DESC");
    return rows.map(mapSaleRow);
  }, [db]);

  const loadSaleWithItems = useCallback(async (saleId: string): Promise<Sale | null> => {
    const sale = await db.getFirstAsync<any>("SELECT * FROM sales WHERE id=?", [saleId]);
    if (!sale) return null;
    const itemRows = await db.getAllAsync<any>("SELECT * FROM sale_items WHERE sale_id=?", [saleId]);
    return { ...mapSaleRow(sale), items: itemRows.map(mapItemRow) };
  }, [db]);

  const loadSaleByInvoiceNumber = useCallback(async (invoiceNumber: string): Promise<Sale | null> => {
    const sale = await db.getFirstAsync<any>("SELECT * FROM sales WHERE invoice_number=?", [invoiceNumber]);
    if (!sale) return null;
    const itemRows = await db.getAllAsync<any>("SELECT * FROM sale_items WHERE sale_id=?", [sale.id]);
    return { ...mapSaleRow(sale), items: itemRows.map(mapItemRow) };
  }, [db]);

  const loadSalesWithItemsByDateRange = useCallback(async (startMs: number, endMs: number): Promise<{ sales: Sale[]; items: SaleItem[] }> => {
    const saleRows = await db.getAllAsync<any>("SELECT * FROM sales WHERE created_at>=? AND created_at<? ORDER BY created_at DESC", [startMs, endMs]);
    const sales = saleRows.map(mapSaleRow);
    if (sales.length === 0) return { sales, items: [] };
    const ids = sales.map((s) => s.id);
    const ph = ids.map(() => "?").join(",");
    const itemRows = await db.getAllAsync<any>(`SELECT * FROM sale_items WHERE sale_id IN (${ph})`, ids);
    return { sales, items: itemRows.map(mapItemRow) };
  }, [db]);

  const processRefund = useCallback(async (originalSaleId: string, staffId?: string, staffName?: string): Promise<Sale> => {
    const deviceCode = await getDeviceCode();
    let refundSale: Sale | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const orig = await tx.getFirstAsync<any>("SELECT * FROM sales WHERE id=?", [originalSaleId]);
      if (!orig) throw new Error("Sale not found");
      if (orig.is_refund === 1) throw new Error("Cannot refund a refund");

      const existing = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM sales WHERE original_sale_id=? AND is_refund=1", [originalSaleId]);
      if (existing && existing.count > 0) throw new Error("Sale already refunded");

      const refundId = generateId();
      const createdAt = Date.now();
      const counterRow = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM invoice_counter WHERE id=1");
      const seq = counterRow?.next_value ?? 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1, deviceCode);
      await tx.runAsync("UPDATE invoice_counter SET next_value=next_value+1 WHERE id=1");

      await tx.runAsync(
        `INSERT INTO sales (id, invoice_number, created_at, subtotal, vat_rate, vat_amount, total, payment_method,
         customer_id, customer_name, staff_id, staff_name, discount_amount, is_refund, original_sale_id,
         loyalty_points_earned, loyalty_points_redeemed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,0,0)`,
        [refundId, invoiceNumber, createdAt, -orig.subtotal, orig.vat_rate, -orig.vat_amount, -orig.total,
         orig.payment_method, orig.customer_id, orig.customer_name,
         staffId ?? orig.staff_id, staffName ?? orig.staff_name,
         -(orig.discount_amount ?? 0), originalSaleId]
      );

      const origItems = await tx.getAllAsync<any>("SELECT * FROM sale_items WHERE sale_id=?", [originalSaleId]);
      for (const item of origItems) {
        await tx.runAsync(
          "INSERT INTO sale_items (id, sale_id, product_id, product_name, product_price, quantity, line_total, discount_amount) VALUES (?,?,?,?,?,?,?,?)",
          [generateId(), refundId, item.product_id, item.product_name, item.product_price, -item.quantity, -item.line_total, -(item.discount_amount ?? 0)]
        );
        await tx.runAsync("UPDATE products SET stock_quantity=stock_quantity+? WHERE id=?", [item.quantity, item.product_id]);
      }

      if (orig.payment_method === "Credit" && orig.customer_id) {
        await tx.runAsync("UPDATE customers SET credit_balance=credit_balance-? WHERE id=?", [orig.total, orig.customer_id]);
      }

      if (orig.customer_id && (orig.loyalty_points_earned ?? 0) > 0) {
        await tx.runAsync("UPDATE customers SET loyalty_points=MAX(0, loyalty_points-?) WHERE id=?", [orig.loyalty_points_earned, orig.customer_id]);
      }

      // Phase 3d: refund-driven customer mutations (credit reversal,
      // loyalty clawback) also need to ride catalog sync.
      const refundCustomerTouched =
        orig.customer_id &&
        (orig.payment_method === "Credit" || (orig.loyalty_points_earned ?? 0) > 0);
      if (refundCustomerTouched) {
        await tx.runAsync("UPDATE customers SET updated_at=? WHERE id=?", [createdAt, orig.customer_id]);
        const cu = await tx.getFirstAsync<{
          id: string; name: string; phone: string | null; email: string | null;
          company: string | null; credit_balance: number; loyalty_points: number | null;
          created_at: number;
        }>(
          "SELECT id, name, phone, email, company, credit_balance, loyalty_points, created_at FROM customers WHERE id=?",
          [orig.customer_id]
        );
        if (cu) {
          const updatedCustomer: Customer = {
            id: cu.id, name: cu.name, phone: cu.phone ?? "", email: cu.email ?? "",
            company: cu.company ?? "", creditBalance: cu.credit_balance,
            loyaltyPoints: cu.loyalty_points ?? 0, createdAt: cu.created_at,
            updatedAt: createdAt,
          };
          await enqueueCatalogTx(tx, "customer", cu.id, updatedCustomer, false, createdAt);
        }
      }

      // Refunds are sales too — enqueue for cloud sync.
      await tx.runAsync(
        "INSERT OR IGNORE INTO sync_queue (id, entity_type, entity_id, enqueued_at, status) VALUES (?, 'sale', ?, ?, 'pending')",
        [generateId(), refundId, createdAt]
      );
      notifySyncQueueChanged();

      refundSale = {
        id: refundId, invoiceNumber, createdAt, subtotal: -orig.subtotal,
        vatRate: orig.vat_rate, vatAmount: -orig.vat_amount, total: -orig.total,
        paymentMethod: orig.payment_method, isRefund: true, originalSaleId,
        staffId: staffId ?? orig.staff_id, staffName: staffName ?? orig.staff_name,
      };
    });
    if (!refundSale) throw new Error("Refund transaction did not complete");
    return refundSale;
  }, [db]);

  const loadBusinessSettings = useCallback(async (): Promise<BusinessSettings> => {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM settings"
    );
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });

    const base: BusinessSettings = {
      businessName: map.businessName ?? "", trn: map.trn ?? "",
      address: map.address ?? "", phone: map.phone ?? "", email: map.email ?? "",
      logoBase64: map.logoBase64 ?? undefined,
      loyaltyPointsPerAed: parseFloat(map.loyaltyPointsPerAed || "1"),
      loyaltyRedemptionRate: parseFloat(map.loyaltyRedemptionRate || "0.01"),
      // vatEnabled: default true; only false when explicitly stored as "false"
      vatEnabled: map.vatEnabled !== undefined ? map.vatEnabled !== "false" : true,
      // allowNegativeStock: default true — existing installs should not
      // suddenly start blocking sales that were previously allowed.
      allowNegativeStock: map.allowNegativeStock !== undefined ? map.allowNegativeStock !== "false" : true,
      // registerOpen: default true for back-compat (existing DBs with no key
      // stored should not lock out users on first upgrade).
      registerOpen: map.registerOpen !== undefined ? map.registerOpen === "true" : true,
      openingFloat: parseFloat(map.openingFloat || "0"),
      openedAt: map.openedAt ? parseInt(map.openedAt, 10) : undefined,
      lastClosingCash: parseFloat(map.lastClosingCash || "0"),
      zReportEmail: map.zReportEmail ?? undefined,
    };

    if (map.receiptDesign) {
      try { base.receiptDesign = JSON.parse(map.receiptDesign); } catch {}
    }
    if (map.printerSettings) {
      try { base.printerSettings = JSON.parse(map.printerSettings); } catch {}
    }
    if (map.kotSettings) {
      try { base.kotSettings = JSON.parse(map.kotSettings); } catch {}
    }
    if (map.customerDisplay) {
      try { base.customerDisplay = JSON.parse(map.customerDisplay); } catch {}
    }
    if (map.rolePermissions) {
      try { base.rolePermissions = JSON.parse(map.rolePermissions); } catch {}
    }
    if (map.smtpConfig) {
      try { base.smtpConfig = JSON.parse(map.smtpConfig); } catch {}
    }

    return base;
  }, [db]);

  const saveBusinessSettings = useCallback(async (settings: BusinessSettings): Promise<void> => {
    const entries: [string, string][] = [
      ["businessName", settings.businessName], ["trn", settings.trn],
      ["address", settings.address], ["phone", settings.phone], ["email", settings.email],
      ["loyaltyPointsPerAed", String(settings.loyaltyPointsPerAed)],
      ["loyaltyRedemptionRate", String(settings.loyaltyRedemptionRate)],
      ["vatEnabled", String(settings.vatEnabled !== false)],
      ["allowNegativeStock", String(settings.allowNegativeStock !== false)],
      ["registerOpen", String(settings.registerOpen === true)],
      ["openingFloat", String(settings.openingFloat ?? 0)],
      ["lastClosingCash", String(settings.lastClosingCash ?? 0)],
    ];
    if (settings.openedAt != null) {
      entries.push(["openedAt", String(settings.openedAt)]);
    }
    if (settings.zReportEmail != null) {
      entries.push(["zReportEmail", settings.zReportEmail]);
    }
    if (settings.logoBase64) {
      entries.push(["logoBase64", settings.logoBase64]);
    } else {
      await db.runAsync("DELETE FROM settings WHERE key=?", ["logoBase64"]);
    }
    if (settings.receiptDesign) {
      entries.push(["receiptDesign", JSON.stringify(settings.receiptDesign)]);
    }
    if (settings.printerSettings) {
      entries.push(["printerSettings", JSON.stringify(settings.printerSettings)]);
    }
    if (settings.kotSettings) {
      entries.push(["kotSettings", JSON.stringify(settings.kotSettings)]);
    }
    if (settings.customerDisplay) {
      entries.push(["customerDisplay", JSON.stringify(settings.customerDisplay)]);
    }
    if (settings.rolePermissions) {
      entries.push(["rolePermissions", JSON.stringify(settings.rolePermissions)]);
    }
    if (settings.smtpConfig) {
      entries.push(["smtpConfig", JSON.stringify(settings.smtpConfig)]);
    }
    for (const [key, value] of entries) {
      await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", [key, value]);
    }
  }, [db]);

  const loadCustomers = useCallback(async (): Promise<Customer[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM customers ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, phone: r.phone ?? "", email: r.email ?? "",
      company: r.company ?? "", creditBalance: r.credit_balance,
      loyaltyPoints: r.loyalty_points ?? 0, createdAt: r.created_at,
      updatedAt: r.updated_at ?? undefined,
      isActive: r.is_active !== 0,
    }));
  }, [db]);

  const createCustomer = useCallback(async (customer: Omit<Customer, "id" | "creditBalance" | "loyaltyPoints" | "createdAt">): Promise<Customer> => {
    const id = generateId();
    const createdAt = Date.now();
    const updatedAt = createdAt;
    const created: Customer = { ...customer, id, creditBalance: 0, loyaltyPoints: 0, createdAt, updatedAt, isActive: customer.isActive !== false };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "INSERT INTO customers (id, name, phone, email, company, credit_balance, loyalty_points, created_at, updated_at, is_active) VALUES (?,?,?,?,?,0,0,?,?,?)",
        [id, customer.name, customer.phone, customer.email, customer.company, createdAt, updatedAt, customer.isActive === false ? 0 : 1]
      );
      await enqueueCatalogTx(tx, "customer", id, created, false, updatedAt);
    });
    return created;
  }, [db]);

  const updateCustomer = useCallback(async (customer: Customer): Promise<void> => {
    const updatedAt = Date.now();
    const next: Customer = { ...customer, updatedAt };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("UPDATE customers SET name=?, phone=?, email=?, company=?, updated_at=?, is_active=? WHERE id=?",
        [customer.name, customer.phone, customer.email, customer.company, updatedAt, customer.isActive === false ? 0 : 1, customer.id]);
      await enqueueCatalogTx(tx, "customer", customer.id, next, false, updatedAt);
    });
  }, [db]);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    const updatedAt = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const c = await tx.getFirstAsync<{ credit_balance: number }>("SELECT credit_balance FROM customers WHERE id=?", [id]);
      if (c && c.credit_balance > 0) throw new Error("Cannot delete customer with outstanding balance");
      await tx.runAsync("DELETE FROM customers WHERE id=?", [id]);
      await enqueueCatalogTx(tx, "customer", id, { id }, true, updatedAt);
    });
  }, [db]);

  const recordCreditPayment = useCallback(async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
    if (amount <= 0) throw new Error("Payment amount must be positive");
    const id = generateId();
    const createdAt = Date.now();
    // expo-sqlite's withExclusiveTransactionAsync is typed `() => Promise<void>`,
    // so we capture the result through a closure rather than returning it.
    let payment: CreditPayment | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const c = await tx.getFirstAsync<{ id: string; name: string; phone: string | null; email: string | null; company: string | null; credit_balance: number; loyalty_points: number | null; created_at: number }>(
        "SELECT id, name, phone, email, company, credit_balance, loyalty_points, created_at FROM customers WHERE id=?",
        [customerId]
      );
      if (!c) throw new Error("Customer not found");
      if (amount > c.credit_balance) throw new Error("Payment exceeds outstanding balance");
      await tx.runAsync("INSERT INTO credit_payments (id, customer_id, amount, note, created_at) VALUES (?,?,?,?,?)", [id, customerId, amount, note, createdAt]);
      // Bump customer.updated_at because credit_balance changed — credit
      // balance is part of the synced payload (full LWW v1, see replit.md).
      await tx.runAsync("UPDATE customers SET credit_balance=credit_balance-?, updated_at=? WHERE id=?", [amount, createdAt, customerId]);
      const updatedCustomer: Customer = {
        id: c.id,
        name: c.name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        company: c.company ?? "",
        creditBalance: c.credit_balance - amount,
        loyaltyPoints: c.loyalty_points ?? 0,
        createdAt: c.created_at,
        updatedAt: createdAt,
      };
      await enqueueCatalogTx(tx, "customer", customerId, updatedCustomer, false, createdAt);
      payment = { id, customerId, amount, note, createdAt };
    });
    if (!payment) throw new Error("Credit payment transaction did not complete");
    return payment;
  }, [db]);

  const loadCreditPayments = useCallback(async (customerId: string): Promise<CreditPayment[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM credit_payments WHERE customer_id=? ORDER BY created_at DESC", [customerId]);
    return rows.map((r: any) => ({ id: r.id, customerId: r.customer_id, amount: r.amount, note: r.note ?? "", createdAt: r.created_at }));
  }, [db]);

  const updateLoyaltyPoints = useCallback(async (customerId: string, delta: number): Promise<void> => {
    const updatedAt = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("UPDATE customers SET loyalty_points=MAX(0, loyalty_points+?), updated_at=? WHERE id=?", [delta, updatedAt, customerId]);
      const c = await tx.getFirstAsync<{ id: string; name: string; phone: string | null; email: string | null; company: string | null; credit_balance: number; loyalty_points: number; created_at: number }>(
        "SELECT id, name, phone, email, company, credit_balance, loyalty_points, created_at FROM customers WHERE id=?",
        [customerId]
      );
      if (!c) return;
      const updatedCustomer: Customer = {
        id: c.id,
        name: c.name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        company: c.company ?? "",
        creditBalance: c.credit_balance,
        loyaltyPoints: c.loyalty_points,
        createdAt: c.created_at,
        updatedAt,
      };
      await enqueueCatalogTx(tx, "customer", customerId, updatedCustomer, false, updatedAt);
    });
  }, [db]);

  const loadStaff = useCallback(async (): Promise<Staff[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM staff ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, role: r.role as Staff["role"],
      pin: r.pin, active: r.active === 1, createdAt: r.created_at,
    }));
  }, [db]);

  const createStaff = useCallback(async (staff: Omit<Staff, "id" | "active" | "createdAt">): Promise<Staff> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync("INSERT INTO staff (id, name, role, pin, active, created_at) VALUES (?,?,?,?,1,?)",
      [id, staff.name, staff.role, staff.pin, createdAt]);
    return { ...staff, id, active: true, createdAt };
  }, [db]);

  const updateStaff = useCallback(async (staff: Staff): Promise<void> => {
    await db.runAsync("UPDATE staff SET name=?, role=?, pin=?, active=? WHERE id=?",
      [staff.name, staff.role, staff.pin, staff.active ? 1 : 0, staff.id]);
  }, [db]);

  const deleteStaff = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM staff WHERE id=?", [id]);
  }, [db]);

  const authenticateStaff = useCallback(async (pin: string): Promise<Staff | null> => {
    const r = await db.getFirstAsync<any>("SELECT * FROM staff WHERE pin=? AND active=1", [pin]);
    if (!r) return null;
    return { id: r.id, name: r.name, role: r.role, pin: r.pin, active: true, createdAt: r.created_at };
  }, [db]);

  const loadTables = useCallback(async (): Promise<PosTable[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM pos_tables ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, capacity: r.capacity,
      status: r.status as PosTable["status"],
      currentOrderId: r.current_order_id ?? undefined, createdAt: r.created_at,
    }));
  }, [db]);

  const createTable = useCallback(async (table: Omit<PosTable, "id" | "status" | "createdAt">): Promise<PosTable> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync("INSERT INTO pos_tables (id, name, capacity, status, created_at) VALUES (?,?,?,'available',?)",
      [id, table.name, table.capacity, createdAt]);
    return { ...table, id, status: "available", createdAt };
  }, [db]);

  const updateTable = useCallback(async (table: PosTable): Promise<void> => {
    await db.runAsync("UPDATE pos_tables SET name=?, capacity=? WHERE id=?", [table.name, table.capacity, table.id]);
  }, [db]);

  const deleteTable = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM pos_tables WHERE id=?", [id]);
  }, [db]);

  const setTableStatus = useCallback(async (id: string, status: PosTable["status"], orderId?: string): Promise<void> => {
    await db.runAsync("UPDATE pos_tables SET status=?, current_order_id=? WHERE id=?", [status, orderId ?? null, id]);
  }, [db]);

  const loadTaxGroups = useCallback(async (): Promise<TaxGroup[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM tax_groups ORDER BY name ASC");
    return rows.map((r: any) => ({ id: r.id, name: r.name, rate: r.rate }));
  }, [db]);

  const createTaxGroup = useCallback(async (group: Omit<TaxGroup, "id">): Promise<TaxGroup> => {
    const id = generateId();
    await db.runAsync("INSERT INTO tax_groups (id, name, rate) VALUES (?,?,?)", [id, group.name, group.rate]);
    return { ...group, id };
  }, [db]);

  const updateTaxGroup = useCallback(async (group: TaxGroup): Promise<void> => {
    await db.runAsync("UPDATE tax_groups SET name=?, rate=? WHERE id=?", [group.name, group.rate, group.id]);
  }, [db]);

  const deleteTaxGroup = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM tax_groups WHERE id=?", [id]);
  }, [db]);

  const loadCategories = useCallback(async (): Promise<Category[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM categories ORDER BY sort_order ASC, name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, colorHex: r.color_hex ?? "#4F8EF7",
      imageUri: r.image_uri ?? undefined, sortOrder: r.sort_order ?? 0,
      updatedAt: r.updated_at ?? undefined,
      isActive: r.is_active !== 0,
    }));
  }, [db]);

  const createCategory = useCallback(async (category: Omit<Category, "id">): Promise<Category> => {
    const id = generateId();
    const updatedAt = Date.now();
    const created: Category = { ...category, id, updatedAt };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "INSERT INTO categories (id, name, color_hex, image_uri, sort_order, updated_at, is_active) VALUES (?,?,?,?,?,?,?)",
        [id, category.name, category.colorHex, category.imageUri ?? null, category.sortOrder, updatedAt, category.isActive === false ? 0 : 1]
      );
      await enqueueCatalogTx(tx, "category", id, created, false, updatedAt);
    });
    return created;
  }, [db]);

  const updateCategory = useCallback(async (category: Category): Promise<void> => {
    const updatedAt = Date.now();
    const next: Category = { ...category, updatedAt };
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "UPDATE categories SET name=?, color_hex=?, image_uri=?, sort_order=?, updated_at=?, is_active=? WHERE id=?",
        [category.name, category.colorHex, category.imageUri ?? null, category.sortOrder, updatedAt, category.isActive === false ? 0 : 1, category.id]
      );
      await enqueueCatalogTx(tx, "category", category.id, next, false, updatedAt);
    });
  }, [db]);

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    const updatedAt = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("DELETE FROM categories WHERE id=?", [id]);
      await enqueueCatalogTx(tx, "category", id, { id }, true, updatedAt);
    });
  }, [db]);

  const loadSplitPayments = useCallback(async (saleId: string): Promise<SplitPaymentEntry[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM split_payments WHERE sale_id=?", [saleId]);
    return rows.map((r: any) => ({ method: r.method, amount: r.amount }));
  }, [db]);

  const saveZReport = useCallback(async (report: any): Promise<void> => {
    const id = generateId();
    await db.runAsync(
      "INSERT INTO z_reports (id, report_date, opened_at, closed_at, opening_cash, closing_cash, total_sales, total_refunds, net_sales, total_vat, total_discount, transaction_count, refund_count, data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, report.date, report.openedAt, report.closedAt, report.openingCash ?? 0, report.closingCash ?? 0,
       report.totalSales, report.totalRefunds, report.netSales, report.totalVat, report.totalDiscount,
       report.transactionCount, report.refundCount, JSON.stringify(report)]
    );
  }, [db]);

  const loadZReports = useCallback(async (): Promise<any[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM z_reports ORDER BY closed_at DESC");
    return rows.map((r: any) => {
      try { return JSON.parse(r.data_json); } catch { return r; }
    });
  }, [db]);

  const loadRiders = useCallback(async (): Promise<Rider[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM riders ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, phone: r.phone ?? "", vehicleInfo: r.vehicle_info ?? "",
      active: r.active === 1, createdAt: r.created_at,
      commissionPct: r.commission_pct ?? 0,
    }));
  }, [db]);

  const createRider = useCallback(async (rider: Omit<Rider, "id" | "active" | "createdAt">): Promise<Rider> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync("INSERT INTO riders (id, name, phone, vehicle_info, active, commission_pct, created_at) VALUES (?,?,?,?,1,?,?)",
      [id, rider.name, rider.phone, rider.vehicleInfo, rider.commissionPct ?? 0, createdAt]);
    return { ...rider, id, active: true, createdAt };
  }, [db]);

  const updateRider = useCallback(async (rider: Rider): Promise<void> => {
    await db.runAsync("UPDATE riders SET name=?, phone=?, vehicle_info=?, active=?, commission_pct=? WHERE id=?",
      [rider.name, rider.phone, rider.vehicleInfo, rider.active ? 1 : 0, rider.commissionPct ?? 0, rider.id]);
  }, [db]);

  const deleteRider = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM riders WHERE id=?", [id]);
  }, [db]);

  const loadAppointments = useCallback(async (dateMs?: number): Promise<Appointment[]> => {
    let rows: any[];
    if (dateMs !== undefined) {
      const d = new Date(dateMs);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      d.setHours(23, 59, 59, 999);
      const end = d.getTime();
      rows = await db.getAllAsync<any>(
        "SELECT * FROM appointments WHERE appointment_date >= ? AND appointment_date <= ? ORDER BY appointment_date ASC",
        [start, end]
      );
    } else {
      rows = await db.getAllAsync<any>("SELECT * FROM appointments ORDER BY appointment_date ASC");
    }
    return rows.map((r: any): Appointment => ({
      id: r.id,
      customerId: r.customer_id ?? undefined,
      customerName: r.customer_name ?? "",
      customerPhone: r.customer_phone ?? "",
      stylistId: r.stylist_id ?? undefined,
      stylistName: r.stylist_name ?? "",
      serviceName: r.service_name ?? "",
      chairId: r.chair_id ?? undefined,
      chairName: r.chair_name ?? "",
      appointmentDate: r.appointment_date,
      durationMinutes: r.duration_minutes ?? 30,
      status: r.status as Appointment["status"],
      notes: r.notes ?? "",
      createdAt: r.created_at,
    }));
  }, [db]);

  const createAppointment = useCallback(async (appt: Omit<Appointment, "id" | "createdAt">): Promise<Appointment> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync(
      "INSERT INTO appointments (id, customer_id, customer_name, customer_phone, stylist_id, stylist_name, service_name, chair_id, chair_name, appointment_date, duration_minutes, status, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, appt.customerId ?? null, appt.customerName, appt.customerPhone, appt.stylistId ?? null, appt.stylistName, appt.serviceName, appt.chairId ?? null, appt.chairName, appt.appointmentDate, appt.durationMinutes, appt.status, appt.notes, createdAt]
    );
    return { ...appt, id, createdAt };
  }, [db]);

  const updateAppointment = useCallback(async (appt: Appointment): Promise<void> => {
    await db.runAsync(
      "UPDATE appointments SET customer_id=?, customer_name=?, customer_phone=?, stylist_id=?, stylist_name=?, service_name=?, chair_id=?, chair_name=?, appointment_date=?, duration_minutes=?, status=?, notes=? WHERE id=?",
      [appt.customerId ?? null, appt.customerName, appt.customerPhone, appt.stylistId ?? null, appt.stylistName, appt.serviceName, appt.chairId ?? null, appt.chairName, appt.appointmentDate, appt.durationMinutes, appt.status, appt.notes, appt.id]
    );
  }, [db]);

  const updateAppointmentStatus = useCallback(async (id: string, status: Appointment["status"]): Promise<void> => {
    await db.runAsync("UPDATE appointments SET status=? WHERE id=?", [status, id]);
  }, [db]);

  const deleteAppointment = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM appointments WHERE id=?", [id]);
  }, [db]);

  const saveHeldOrder = useCallback(async (order: Omit<HeldOrder, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<HeldOrder> => {
    const now = Date.now();
    const isUpdate = !!order.id;
    const id = order.id || generateId();

    if (isUpdate) {
      await db.runAsync("UPDATE held_orders SET table_id=?, table_name=?, order_type=?, staff_id=?, staff_name=?, customer_id=?, customer_name=?, kds_status='new', updated_at=? WHERE id=?",
        [order.tableId, order.tableName, order.orderType, order.staffId ?? null, order.staffName ?? null, order.customerId ?? null, order.customerName ?? null, now, id]);
      await db.runAsync("DELETE FROM held_order_items WHERE held_order_id=?", [id]);
    } else {
      await db.runAsync("INSERT INTO held_orders (id, table_id, table_name, order_type, staff_id, staff_name, customer_id, customer_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, order.tableId, order.tableName, order.orderType, order.staffId ?? null, order.staffName ?? null, order.customerId ?? null, order.customerName ?? null, now, now]);
    }

    for (const item of order.items) {
      const itemId = generateId();
      await db.runAsync(
        "INSERT INTO held_order_items (id, held_order_id, product_id, product_name, product_price, quantity, color_hex, category, tax_rate, discount_type, discount_value, discount_amount, image_uri) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [itemId, id, item.productId, item.productName, item.productPrice, item.quantity, item.colorHex, item.category, item.taxRate ?? null, item.discountType ?? null, item.discountValue ?? null, item.discountAmount ?? 0, item.imageUri ?? null]
      );
    }

    await db.runAsync("UPDATE pos_tables SET status='occupied', current_order_id=? WHERE id=?", [id, order.tableId]);

    const existingCreatedAt = isUpdate
      ? (await db.getFirstAsync<any>("SELECT created_at FROM held_orders WHERE id=?", [id]))?.created_at ?? now
      : now;
    return { ...order, id, createdAt: existingCreatedAt, updatedAt: now };
  }, [db]);

  const loadHeldOrders = useCallback(async (): Promise<HeldOrder[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM held_orders ORDER BY updated_at DESC");
    const allItems = await db.getAllAsync<any>("SELECT * FROM held_order_items");
    return rows.map((r: any) => ({
      id: r.id, tableId: r.table_id, tableName: r.table_name, orderType: r.order_type ?? "dine-in",
      staffId: r.staff_id ?? undefined, staffName: r.staff_name ?? undefined,
      customerId: r.customer_id ?? undefined, customerName: r.customer_name ?? undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
      kdsStatus: r.kds_status ?? "new",
      items: allItems.filter((i: any) => i.held_order_id === r.id).map((i: any): HeldOrderItem => ({
        id: i.id, heldOrderId: i.held_order_id, productId: i.product_id,
        productName: i.product_name, productPrice: i.product_price, quantity: i.quantity,
        colorHex: i.color_hex ?? "#4F8EF7", category: i.category ?? "",
        taxRate: i.tax_rate ?? undefined, discountType: i.discount_type ?? undefined,
        discountValue: i.discount_value ?? undefined, discountAmount: i.discount_amount ?? 0,
        imageUri: i.image_uri ?? undefined,
      })),
    }));
  }, [db]);

  const loadHeldOrderByTable = useCallback(async (tableId: string): Promise<HeldOrder | null> => {
    const row = await db.getFirstAsync<any>("SELECT * FROM held_orders WHERE table_id=?", [tableId]);
    if (!row) return null;
    const items = await db.getAllAsync<any>("SELECT * FROM held_order_items WHERE held_order_id=?", [row.id]);
    return {
      id: row.id, tableId: row.table_id, tableName: row.table_name, orderType: row.order_type ?? "dine-in",
      staffId: row.staff_id ?? undefined, staffName: row.staff_name ?? undefined,
      customerId: row.customer_id ?? undefined, customerName: row.customer_name ?? undefined,
      createdAt: row.created_at, updatedAt: row.updated_at,
      kdsStatus: row.kds_status ?? "new",
      items: items.map((i: any): HeldOrderItem => ({
        id: i.id, heldOrderId: i.held_order_id, productId: i.product_id,
        productName: i.product_name, productPrice: i.product_price, quantity: i.quantity,
        colorHex: i.color_hex ?? "#4F8EF7", category: i.category ?? "",
        taxRate: i.tax_rate ?? undefined, discountType: i.discount_type ?? undefined,
        discountValue: i.discount_value ?? undefined, discountAmount: i.discount_amount ?? 0,
        imageUri: i.image_uri ?? undefined,
      })),
    };
  }, [db]);

  const deleteHeldOrder = useCallback(async (id: string): Promise<void> => {
    const order = await db.getFirstAsync<any>("SELECT table_id FROM held_orders WHERE id=?", [id]);
    await db.runAsync("DELETE FROM held_order_items WHERE held_order_id=?", [id]);
    await db.runAsync("DELETE FROM held_orders WHERE id=?", [id]);
    if (order) {
      await db.runAsync("UPDATE pos_tables SET status='available', current_order_id=NULL WHERE id=?", [order.table_id]);
    }
  }, [db]);

  const updateKdsStatus = useCallback(async (id: string, status: import("../types").KdsStatus): Promise<void> => {
    await db.runAsync("UPDATE held_orders SET kds_status=? WHERE id=?", [status, id]);
  }, [db]);

  const loadIngredients = useCallback(async (): Promise<Ingredient[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM ingredients ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, unit: r.unit, stockQuantity: r.stock_quantity,
      costPerUnit: r.cost_per_unit, lowStockThreshold: r.low_stock_threshold, createdAt: r.created_at,
    }));
  }, [db]);

  const createIngredient = useCallback(async (ingredient: Omit<Ingredient, "id" | "createdAt">): Promise<Ingredient> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync("INSERT INTO ingredients (id, name, unit, stock_quantity, cost_per_unit, low_stock_threshold, created_at) VALUES (?,?,?,?,?,?,?)",
      [id, ingredient.name, ingredient.unit, ingredient.stockQuantity, ingredient.costPerUnit, ingredient.lowStockThreshold, createdAt]);
    return { ...ingredient, id, createdAt };
  }, [db]);

  const updateIngredient = useCallback(async (ingredient: Ingredient): Promise<void> => {
    await db.runAsync("UPDATE ingredients SET name=?, unit=?, stock_quantity=?, cost_per_unit=?, low_stock_threshold=? WHERE id=?",
      [ingredient.name, ingredient.unit, ingredient.stockQuantity, ingredient.costPerUnit, ingredient.lowStockThreshold, ingredient.id]);
  }, [db]);

  const deleteIngredient = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM recipe_ingredients WHERE ingredient_id=?", [id]);
    await db.runAsync("DELETE FROM ingredients WHERE id=?", [id]);
  }, [db]);

  const updateIngredientStock = useCallback(async (ingredientId: string, delta: number): Promise<void> => {
    await db.runAsync("UPDATE ingredients SET stock_quantity = MAX(0, stock_quantity + ?) WHERE id=?", [delta, ingredientId]);
  }, [db]);

  const loadRecipeIngredients = useCallback(async (productId: string): Promise<RecipeIngredient[]> => {
    const rows = await db.getAllAsync<any>(
      "SELECT ri.*, i.name as ingredient_name FROM recipe_ingredients ri LEFT JOIN ingredients i ON ri.ingredient_id = i.id WHERE ri.product_id=?",
      [productId]
    );
    return rows.map((r: any) => ({
      id: r.id, productId: r.product_id, ingredientId: r.ingredient_id,
      ingredientName: r.ingredient_name ?? undefined, quantity: r.quantity,
    }));
  }, [db]);

  const saveRecipeIngredients = useCallback(async (productId: string, items: Omit<RecipeIngredient, "id">[]): Promise<void> => {
    await db.runAsync("DELETE FROM recipe_ingredients WHERE product_id=?", [productId]);
    for (const item of items) {
      await db.runAsync("INSERT INTO recipe_ingredients (id, product_id, ingredient_id, quantity) VALUES (?,?,?,?)",
        [generateId(), productId, item.ingredientId, item.quantity]);
    }
  }, [db]);

  const deleteRecipeIngredients = useCallback(async (productId: string): Promise<void> => {
    await db.runAsync("DELETE FROM recipe_ingredients WHERE product_id=?", [productId]);
  }, [db]);

  const loadModifierGroups = useCallback(async (productId: string): Promise<ModifierGroup[]> => {
    const groups = await db.getAllAsync<any>(
      "SELECT * FROM modifier_groups WHERE product_id=? ORDER BY sort_order", [productId]);
    const result: ModifierGroup[] = [];
    for (const g of groups) {
      const opts = await db.getAllAsync<any>(
        "SELECT * FROM modifier_options WHERE group_id=? ORDER BY sort_order", [g.id]);
      result.push({
        id: g.id, productId: g.product_id, name: g.name,
        required: g.required === 1, minSelections: g.min_selections,
        maxSelections: g.max_selections, sortOrder: g.sort_order,
        options: opts.map((o: any) => ({
          id: o.id, groupId: o.group_id, name: o.name,
          priceAdjustment: o.price_adjustment, sortOrder: o.sort_order,
        })),
      });
    }
    return result;
  }, [db]);

  const loadAllModifierGroups = useCallback(async (): Promise<ModifierGroup[]> => {
    const groups = await db.getAllAsync<any>(
      "SELECT * FROM modifier_groups ORDER BY product_id, sort_order");
    const optRows = await db.getAllAsync<any>(
      "SELECT * FROM modifier_options ORDER BY group_id, sort_order");
    const optsByGroup: Record<string, any[]> = {};
    for (const o of optRows) {
      (optsByGroup[o.group_id] ??= []).push(o);
    }
    return groups.map((g: any) => ({
      id: g.id, productId: g.product_id, name: g.name,
      required: g.required === 1, minSelections: g.min_selections,
      maxSelections: g.max_selections, sortOrder: g.sort_order,
      options: (optsByGroup[g.id] ?? []).map((o: any) => ({
        id: o.id, groupId: o.group_id, name: o.name,
        priceAdjustment: o.price_adjustment, sortOrder: o.sort_order,
      })),
    }));
  }, [db]);

  const saveModifierGroups = useCallback(async (
    productId: string,
    groups: Omit<ModifierGroup, "id" | "options">[],
    options: { groupIdx: number; name: string; priceAdjustment: number; sortOrder: number }[][],
  ): Promise<void> => {
    await db.runAsync(
      "DELETE FROM modifier_options WHERE group_id IN (SELECT id FROM modifier_groups WHERE product_id=?)",
      [productId]);
    await db.runAsync("DELETE FROM modifier_groups WHERE product_id=?", [productId]);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const groupId = generateId();
      await db.runAsync(
        "INSERT INTO modifier_groups (id, product_id, name, required, min_selections, max_selections, sort_order) VALUES (?,?,?,?,?,?,?)",
        [groupId, productId, g.name, g.required ? 1 : 0, g.minSelections, g.maxSelections, g.sortOrder]);
      for (const opt of (options[i] ?? [])) {
        await db.runAsync(
          "INSERT INTO modifier_options (id, group_id, name, price_adjustment, sort_order) VALUES (?,?,?,?,?)",
          [generateId(), groupId, opt.name, opt.priceAdjustment, opt.sortOrder]);
      }
    }
  }, [db]);

  const ALL_TABLES = [
    "products", "categories", "sales", "sale_items", "settings", "customers",
    "credit_payments", "staff", "pos_tables", "tax_groups", "split_payments",
    "z_reports", "riders", "held_orders", "held_order_items", "ingredients",
    "recipe_ingredients", "invoice_counter", "expenses",
  ];

  const loadExpenses = useCallback(async (fromMs?: number, toMs?: number): Promise<Expense[]> => {
    let sql = "SELECT * FROM expenses";
    const args: any[] = [];
    if (fromMs != null && toMs != null) {
      sql += " WHERE created_at>=? AND created_at<?";
      args.push(fromMs, toMs);
    }
    sql += " ORDER BY created_at DESC";
    const rows = await db.getAllAsync<any>(sql, args);
    return rows.map((r: any) => ({
      id: r.id, amount: r.amount, note: r.note ?? "",
      staffId: r.staff_id ?? undefined, staffName: r.staff_name ?? undefined,
      createdAt: r.created_at,
    }));
  }, [db]);

  const createExpense = useCallback(async (expense: Omit<Expense, "id" | "createdAt"> & { createdAt?: number }): Promise<Expense> => {
    const id = generateId();
    const createdAt = expense.createdAt ?? Date.now();
    await db.runAsync(
      "INSERT INTO expenses (id, amount, note, staff_id, staff_name, created_at) VALUES (?,?,?,?,?,?)",
      [id, expense.amount, expense.note ?? "", expense.staffId ?? null, expense.staffName ?? null, createdAt]
    );
    return { id, amount: expense.amount, note: expense.note ?? "", staffId: expense.staffId, staffName: expense.staffName, createdAt };
  }, [db]);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM expenses WHERE id=?", [id]);
  }, [db]);

  const exportData = useCallback(async (): Promise<BackupData> => {
    const tables: Record<string, unknown[]> = {};
    for (const t of ALL_TABLES) {
      try {
        tables[t] = await db.getAllAsync<any>(`SELECT * FROM ${t}`);
      } catch {
        tables[t] = [];
      }
    }
    return { app: "al-salik-pos", version: 1, exportedAt: Date.now(), tables };
  }, [db]);

  const importData = useCallback(async (data: BackupData): Promise<void> => {
    if (data.app !== "al-salik-pos") throw new Error("Invalid backup");
    await db.withTransactionAsync(async () => {
      for (const t of ALL_TABLES) {
        try { await db.runAsync(`DELETE FROM ${t}`); } catch {}
      }
      // Backup contains foreign data — drop the sync queue and catalog
      // outbox too so we don't try to push imported rows as if they were
      // our own. clearOwningCompanyId() (called below) also clears the
      // pull cursor so the next sync starts fresh.
      try { await db.runAsync("DELETE FROM sync_queue"); } catch {}
      try { await db.runAsync("DELETE FROM catalog_outbox"); } catch {}
      for (const t of ALL_TABLES) {
        const rows = data.tables?.[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = Object.keys(rows[0] as any);
        const placeholders = cols.map(() => "?").join(",");
        const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(",")}) VALUES (${placeholders})`;
        for (const row of rows) {
          const vals = cols.map((c) => (row as any)[c]);
          try { await db.runAsync(sql, vals); } catch {}
        }
      }
    });
    // Clear the tenant ownership stamp so the next sync run treats this as
    // unverified data. SyncContext will refuse to push because sales now
    // exist with no stamp — operator must explicitly wipe and re-activate
    // before any cloud push happens.
    try { await clearOwningCompanyId(); } catch {}
  }, [db]);

  const clearData = useCallback(async (opts: ClearDataOptions): Promise<void> => {
    await db.withTransactionAsync(async () => {
      if (opts.sales) {
        await db.runAsync("DELETE FROM sale_items");
        await db.runAsync("DELETE FROM split_payments");
        await db.runAsync("DELETE FROM sales");
      }
      if (opts.zReports) await db.runAsync("DELETE FROM z_reports");
      if (opts.heldOrders) {
        await db.runAsync("DELETE FROM held_order_items");
        await db.runAsync("DELETE FROM held_orders");
        await db.runAsync("UPDATE pos_tables SET status='available', current_order_id=NULL");
      }
      if (opts.customers) {
        await db.runAsync("DELETE FROM credit_payments");
        await db.runAsync("DELETE FROM customers");
      }
      if (opts.products) {
        await db.runAsync("DELETE FROM recipe_ingredients");
        await db.runAsync("DELETE FROM products");
        // Drop pending catalog pushes for products — the rows are gone
        // locally so any tombstone we try to push would lose context.
        await db.runAsync("DELETE FROM catalog_outbox WHERE entity_type='product'");
      }
      if (opts.categories) {
        await db.runAsync("DELETE FROM categories");
        await db.runAsync("DELETE FROM catalog_outbox WHERE entity_type='category'");
      }
      if (opts.customers) {
        // Wiping customers locally — drop pending pushes for them too so
        // the cloud doesn't see ghost edits/tombstones for rows the user
        // explicitly cleared.
        await db.runAsync("DELETE FROM catalog_outbox WHERE entity_type='customer'");
      }
      if (opts.recipes) {
        await db.runAsync("DELETE FROM recipe_ingredients");
      }
      if (opts.ingredients) {
        await db.runAsync("DELETE FROM recipe_ingredients");
        await db.runAsync("DELETE FROM ingredients");
      }
      if (opts.taxGroups) await db.runAsync("DELETE FROM tax_groups");
      if (opts.riders) await db.runAsync("DELETE FROM riders");
      if (opts.tables) {
        await db.runAsync("DELETE FROM held_order_items");
        await db.runAsync("DELETE FROM held_orders");
        await db.runAsync("DELETE FROM pos_tables");
      }
      if (opts.sales) {
        // Sales were wiped — drop their queue entries too so we don't push
        // ghosts to the cloud.
        await db.runAsync("DELETE FROM sync_queue WHERE entity_type='sale'");
      }
      if (opts.resetInvoiceCounter || opts.sales) {
        await db.runAsync("UPDATE invoice_counter SET next_value=1 WHERE id=1");
      }
      if (opts.expenses) {
        await db.runAsync("DELETE FROM expenses");
      }
      if (opts.suppliers) {
        await db.runAsync("DELETE FROM local_suppliers");
      }
      if (opts.purchases) {
        await db.runAsync("DELETE FROM local_purchase_items");
        await db.runAsync("DELETE FROM local_purchases");
      }
      if (opts.stockMovements) {
        await db.runAsync("DELETE FROM local_stock_movements");
      }
    });
  }, [db]);

  // ---- Phase 3b: outbound sync queue ----

  const enqueueSync = useCallback(async (entityType: SyncEntityType, entityId: string): Promise<void> => {
    await db.runAsync(
      "INSERT OR IGNORE INTO sync_queue (id, entity_type, entity_id, enqueued_at, status) VALUES (?, ?, ?, ?, 'pending')",
      [generateId(), entityType, entityId, Date.now()]
    );
    // Wake the SyncContext loop immediately instead of waiting for the next
    // 30s idle tick. Cheap pub/sub; safe to call even if no listener exists.
    notifySyncQueueChanged();
  }, [db]);

  const reconcilePendingSync = useCallback(async (): Promise<number> => {
    // Add a queue row for any sale that doesn't already have one. Catches
    // legacy sales (made before this feature) and any sale that was somehow
    // committed without an enqueue.
    const before = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE entity_type='sale'"
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_queue (id, entity_type, entity_id, enqueued_at, status)
       SELECT lower(hex(randomblob(16))), 'sale', s.id, ?, 'pending'
       FROM sales s
       WHERE NOT EXISTS (
         SELECT 1 FROM sync_queue q WHERE q.entity_type='sale' AND q.entity_id=s.id
       )`,
      [Date.now()]
    );
    const after = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE entity_type='sale'"
    );
    return (after?.count ?? 0) - (before?.count ?? 0);
  }, [db]);

  const loadSyncBatch = useCallback(async (entityType: SyncEntityType, limit: number): Promise<SyncQueueItem[]> => {
    const rows = await db.getAllAsync<{
      id: string; entity_type: string; entity_id: string;
      attempt_count: number; last_attempt_at: number | null;
    }>(
      `SELECT id, entity_type, entity_id, attempt_count, last_attempt_at
       FROM sync_queue
       WHERE entity_type=? AND status='pending'
       ORDER BY enqueued_at ASC
       LIMIT ?`,
      [entityType, limit]
    );
    return rows.map((r) => ({
      queueId: r.id,
      entityType: r.entity_type as SyncEntityType,
      entityId: r.entity_id,
      attemptCount: r.attempt_count,
      lastAttemptAt: r.last_attempt_at ?? null,
    }));
  }, [db]);

  const markSyncResults = useCallback(async (results: SyncResultUpdate[]): Promise<void> => {
    if (results.length === 0) return;
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const r of results) {
        if (r.ok) {
          // Server has the row — drop it from the queue.
          await tx.runAsync("DELETE FROM sync_queue WHERE id=?", [r.queueId]);
        } else {
          await tx.runAsync(
            "UPDATE sync_queue SET attempt_count=attempt_count+1, last_attempt_at=?, last_error=? WHERE id=?",
            [now, r.error ?? null, r.queueId]
          );
        }
      }
    });
  }, [db]);

  const countPendingSync = useCallback(async (entityType: SyncEntityType): Promise<number> => {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE entity_type=? AND status='pending'",
      [entityType]
    );
    return row?.count ?? 0;
  }, [db]);

  // ---- Phase 3c: catalog outbox + remote apply ----

  const loadCatalogBatch = useCallback(async (limit: number): Promise<CatalogOutboxItem[]> => {
    const rows = await db.getAllAsync<{
      id: string; entity_type: string; entity_id: string;
      payload: string; deleted: number; updated_at: number;
      attempt_count: number; last_attempt_at: number | null;
    }>(
      `SELECT id, entity_type, entity_id, payload, deleted, updated_at,
              attempt_count, last_attempt_at
       FROM catalog_outbox
       ORDER BY enqueued_at ASC
       LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      outboxId: r.id,
      entityType: r.entity_type as "product" | "category" | "customer",
      entityId: r.entity_id,
      payload: safeParse(r.payload),
      deleted: r.deleted === 1,
      updatedAt: r.updated_at,
      attemptCount: r.attempt_count,
      lastAttemptAt: r.last_attempt_at ?? null,
    }));
  }, [db]);

  const markCatalogResults = useCallback(async (results: CatalogResultUpdate[]): Promise<void> => {
    if (results.length === 0) return;
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const r of results) {
        if (r.ok) {
          // Only drop the row if the user hasn't re-edited it during the
          // push (UPSERT keeps the same id but bumps updated_at). If the
          // updated_at no longer matches what we pushed, leave the row
          // alone so the newer edit gets its own push attempt.
          await tx.runAsync(
            "DELETE FROM catalog_outbox WHERE id=? AND updated_at=?",
            [r.outboxId, r.attemptedUpdatedAt]
          );
        } else {
          // Same freshness guard for failure: don't bump attempt_count of a
          // row that has since been superseded by a newer edit (which reset
          // attempts to 0). The newer edit is what we want to retry.
          await tx.runAsync(
            "UPDATE catalog_outbox SET attempt_count=attempt_count+1, last_attempt_at=?, last_error=? WHERE id=? AND updated_at=?",
            [now, r.error ?? null, r.outboxId, r.attemptedUpdatedAt]
          );
        }
      }
    });
  }, [db]);

  const countPendingCatalog = useCallback(async (): Promise<number> => {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM catalog_outbox"
    );
    return row?.count ?? 0;
  }, [db]);

  const loadSyncQueue = useCallback(async (): Promise<SyncQueueRow[]> => {
    const rows = await db.getAllAsync<{
      id: string; entity_type: string; entity_id: string;
      enqueued_at: number; attempt_count: number; last_attempt_at: number | null;
      last_error: string | null; status: string;
    }>(
      `SELECT id, entity_type, entity_id, enqueued_at, attempt_count,
              last_attempt_at, last_error, status
       FROM sync_queue ORDER BY enqueued_at DESC`
    );
    return rows.map((r) => ({
      queueId: r.id,
      entityType: r.entity_type as SyncEntityType,
      entityId: r.entity_id,
      enqueuedAt: r.enqueued_at,
      attemptCount: r.attempt_count,
      lastAttemptAt: r.last_attempt_at ?? null,
      lastError: r.last_error ?? null,
      status: r.status,
    }));
  }, [db]);

  const loadCatalogOutbox = useCallback(async (): Promise<CatalogOutboxRow[]> => {
    const rows = await db.getAllAsync<{
      id: string; entity_type: string; entity_id: string;
      deleted: number; enqueued_at: number; updated_at: number;
      attempt_count: number; last_attempt_at: number | null; last_error: string | null;
    }>(
      `SELECT id, entity_type, entity_id, deleted, enqueued_at, updated_at,
              attempt_count, last_attempt_at, last_error
       FROM catalog_outbox ORDER BY enqueued_at DESC`
    );
    return rows.map((r) => ({
      outboxId: r.id,
      entityType: r.entity_type as CatalogEntityType,
      entityId: r.entity_id,
      deleted: r.deleted === 1,
      enqueuedAt: r.enqueued_at,
      updatedAt: r.updated_at,
      attemptCount: r.attempt_count,
      lastAttemptAt: r.last_attempt_at ?? null,
      lastError: r.last_error ?? null,
    }));
  }, [db]);

  const dismissSyncItem = useCallback(async (queueId: string): Promise<void> => {
    await db.runAsync("DELETE FROM sync_queue WHERE id=?", [queueId]);
    notifySyncQueueChanged();
  }, [db]);

  const dismissCatalogItem = useCallback(async (outboxId: string): Promise<void> => {
    await db.runAsync("DELETE FROM catalog_outbox WHERE id=?", [outboxId]);
    notifySyncQueueChanged();
  }, [db]);

  const insertSyncLog = useCallback(async (entry: Omit<SyncLogEntry, "id">): Promise<void> => {
    await db.runAsync(
      `INSERT INTO sync_log (id, at, kind, attempted, succeeded, failed, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), entry.at, entry.kind, entry.attempted, entry.succeeded, entry.failed, entry.error ?? null]
    );
    await db.runAsync(
      `DELETE FROM sync_log WHERE id NOT IN (
         SELECT id FROM sync_log ORDER BY at DESC LIMIT 200
       )`
    );
  }, [db]);

  const loadSyncLogs = useCallback(async (limit: number): Promise<SyncLogEntry[]> => {
    const rows = await db.getAllAsync<{
      id: string; at: number; kind: string;
      attempted: number; succeeded: number; failed: number; error: string | null;
    }>(
      `SELECT id, at, kind, attempted, succeeded, failed, error
       FROM sync_log ORDER BY at DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      kind: r.kind as SyncLogKind,
      attempted: r.attempted,
      succeeded: r.succeeded,
      failed: r.failed,
      error: r.error ?? null,
    }));
  }, [db]);

  const clearSyncLogs = useCallback(async (): Promise<void> => {
    await db.runAsync("DELETE FROM sync_log");
  }, [db]);

  const applyRemoteCatalog = useCallback(async (input: CatalogApplyInput): Promise<void> => {
    const products = input.products ?? [];
    const categories = input.categories ?? [];
    const customers = input.customers ?? [];
    if (products.length === 0 && categories.length === 0 && customers.length === 0) return;
    await db.withExclusiveTransactionAsync(async (tx) => {
      // Pre-load any pending outbox snapshots for entities in this batch.
      // A pending unpushed local edit (including a delete — where the row
      // is gone from the entity table but a tombstone sits in the outbox)
      // must NOT be clobbered by a stale pull. We compare against the
      // outbox's updatedAt as the authoritative "latest local write" stamp.
      const outboxByKey = await loadOutboxIndex(tx, [
        ...products.map((e) => ["product", e.id] as const),
        ...categories.map((e) => ["category", e.id] as const),
        ...customers.map((e) => ["customer", e.id] as const),
      ]);

      for (const e of products) {
        const pending = outboxByKey.get(`product:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = await tx.getFirstAsync<{ updated_at: number | null }>(
          "SELECT updated_at FROM products WHERE id=?", [e.id]
        );
        // LWW: skip if local has a strictly newer or equal write. Treat
        // NULL local as 0 so any real cloud edit wins over seed rows.
        const localUpdatedAt = existing?.updated_at ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          await tx.runAsync("DELETE FROM products WHERE id=?", [e.id]);
          continue;
        }
        const p = e.payload as Partial<Product>;
        // Use INSERT OR REPLACE to handle both create and update in one
        // statement. Stamp updated_at from the *remote* clock so a
        // subsequent pull doesn't keep re-applying.
        // Preserve local stock_quantity / stock_tracking when the remote
        // payload doesn't carry an explicit stockQuantity (NULL). This prevents
        // a catalog sync from zeroing out stock the merchant just received.
        await tx.runAsync(
          `INSERT OR REPLACE INTO products
           (id, name, category, price, description, color_hex, barcode,
            stock_quantity, stock_tracking,
            tax_group_id, low_stock_threshold, image_uri,
            printer_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?,
            COALESCE(?, (SELECT stock_quantity FROM products WHERE id=?), 999),
            CASE WHEN ? IS NOT NULL THEN 1
                 ELSE COALESCE((SELECT stock_tracking FROM products WHERE id=?), 0) END,
            ?, ?, ?, ?, ?)`,
          [e.id, p.name ?? "", p.category ?? "", p.price ?? 0, p.description ?? "",
           p.colorHex ?? "#4F8EF7", p.barcode ?? null,
           p.stockQuantity ?? null, e.id,
           p.stockQuantity ?? null, e.id,
           p.taxGroupId ?? null, p.lowStockThreshold ?? 10, p.imageUri ?? null,
           p.printerId ?? null, e.updatedAt]
        );
      }
      for (const e of categories) {
        const pending = outboxByKey.get(`category:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = await tx.getFirstAsync<{ updated_at: number | null }>(
          "SELECT updated_at FROM categories WHERE id=?", [e.id]
        );
        const localUpdatedAt = existing?.updated_at ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          await tx.runAsync("DELETE FROM categories WHERE id=?", [e.id]);
          continue;
        }
        const c = e.payload as Partial<Category>;
        await tx.runAsync(
          `INSERT OR REPLACE INTO categories
           (id, name, color_hex, image_uri, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [e.id, c.name ?? "", c.colorHex ?? "#4F8EF7", c.imageUri ?? null,
           c.sortOrder ?? 0, e.updatedAt]
        );
      }
      for (const e of customers) {
        const pending = outboxByKey.get(`customer:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = await tx.getFirstAsync<{ updated_at: number | null }>(
          "SELECT updated_at FROM customers WHERE id=?", [e.id]
        );
        const localUpdatedAt = existing?.updated_at ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          await tx.runAsync("DELETE FROM customers WHERE id=?", [e.id]);
          continue;
        }
        const cu = e.payload as Partial<Customer>;
        // Stamp the customer's `created_at` from the remote payload if
        // present; fall back to the remote updatedAt for legacy rows that
        // didn't carry it. Never lose an existing local created_at value.
        const incomingCreatedAt = typeof cu.createdAt === "number" ? cu.createdAt : e.updatedAt;
        await tx.runAsync(
          `INSERT OR REPLACE INTO customers
           (id, name, phone, email, company, credit_balance, loyalty_points, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, cu.name ?? "", cu.phone ?? "", cu.email ?? "", cu.company ?? "",
           typeof cu.creditBalance === "number" ? cu.creditBalance : 0,
           typeof cu.loyaltyPoints === "number" ? cu.loyaltyPoints : 0,
           incomingCreatedAt, e.updatedAt]
        );
      }
    });
  }, [db]);

  // ---- Local offline storage (SQLite) ----

  const loadLocalSuppliers = useCallback(async (): Promise<LocalSupplier[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM local_suppliers ORDER BY name");
    return rows.map((r) => ({
      id: r.id, name: r.name, trnNumber: r.trn_number, phone: r.phone,
      email: r.email, address: r.address, paymentTerms: r.payment_terms,
      notes: r.notes, isActive: r.is_active === 1, createdAt: r.created_at,
    }));
  }, [db]);

  const createLocalSupplier = useCallback(async (s: Omit<LocalSupplier, "id" | "createdAt">): Promise<LocalSupplier> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync(
      "INSERT INTO local_suppliers (id, name, trn_number, phone, email, address, payment_terms, notes, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [id, s.name, s.trnNumber ?? null, s.phone ?? null, s.email ?? null, s.address ?? null, s.paymentTerms ?? null, s.notes ?? null, s.isActive ? 1 : 0, createdAt]
    );
    return { ...s, id, createdAt };
  }, [db]);

  const updateLocalSupplier = useCallback(async (s: LocalSupplier): Promise<void> => {
    await db.runAsync(
      "UPDATE local_suppliers SET name=?, trn_number=?, phone=?, email=?, address=?, payment_terms=?, notes=?, is_active=? WHERE id=?",
      [s.name, s.trnNumber ?? null, s.phone ?? null, s.email ?? null, s.address ?? null, s.paymentTerms ?? null, s.notes ?? null, s.isActive ? 1 : 0, s.id]
    );
  }, [db]);

  const loadLocalPurchases = useCallback(async (): Promise<LocalPurchase[]> => {
    const rows = await db.getAllAsync<any>(`
      SELECT lp.*, COUNT(lpi.id) AS item_count
      FROM local_purchases lp
      LEFT JOIN local_purchase_items lpi ON lpi.purchase_id = lp.id
      GROUP BY lp.id
      ORDER BY lp.received_at DESC
    `);
    return rows.map((r) => ({
      id: r.id, supplierName: r.supplier_name, referenceNumber: r.reference_number,
      receivedAt: r.received_at, notes: r.notes, subtotal: r.subtotal,
      vatAmount: r.vat_amount, total: r.total, itemCount: r.item_count ?? 0, createdAt: r.created_at,
    }));
  }, [db]);

  const getLocalPurchase = useCallback(async (id: string): Promise<{ purchase: LocalPurchase; items: LocalPurchaseItem[] } | null> => {
    const row = await db.getFirstAsync<any>("SELECT * FROM local_purchases WHERE id=?", [id]);
    if (!row) return null;
    const itemRows = await db.getAllAsync<any>("SELECT * FROM local_purchase_items WHERE purchase_id=?", [id]);
    return {
      purchase: {
        id: row.id, supplierName: row.supplier_name, referenceNumber: row.reference_number,
        receivedAt: row.received_at, notes: row.notes, subtotal: row.subtotal,
        vatAmount: row.vat_amount, total: row.total, itemCount: itemRows.length, createdAt: row.created_at,
      },
      items: itemRows.map((r) => ({
        id: r.id, purchaseId: r.purchase_id, productClientId: r.product_client_id,
        productName: r.product_name, sku: r.sku, quantity: r.quantity,
        unitCost: r.unit_cost, vatAmount: r.vat_amount, lineTotal: r.line_total,
      })),
    };
  }, [db]);

  const createLocalPurchase = useCallback(async (data: {
    supplierName: string;
    referenceNumber?: string | null;
    notes?: string | null;
    items: Array<{ productClientId: string; productName: string; sku?: string | null; quantity: number; unitCost: number; vatAmount: number }>;
  }): Promise<{ purchase: LocalPurchase; items: LocalPurchaseItem[] }> => {
    const id = generateId();
    const createdAt = Date.now();
    let subtotal = 0;
    let vatAmount = 0;
    for (const l of data.items) { subtotal += l.quantity * l.unitCost; vatAmount += l.vatAmount; }
    const total = subtotal + vatAmount;
    const savedItems: LocalPurchaseItem[] = [];
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        "INSERT INTO local_purchases (id, supplier_name, reference_number, received_at, notes, subtotal, vat_amount, total, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, data.supplierName, data.referenceNumber ?? null, createdAt, data.notes ?? null, subtotal, vatAmount, total, createdAt]
      );
      for (const l of data.items) {
        const itemId = generateId();
        const lineTotal = l.quantity * l.unitCost + l.vatAmount;
        await tx.runAsync(
          "INSERT INTO local_purchase_items (id, purchase_id, product_client_id, product_name, sku, quantity, unit_cost, vat_amount, line_total) VALUES (?,?,?,?,?,?,?,?,?)",
          [itemId, id, l.productClientId, l.productName, l.sku ?? null, l.quantity, l.unitCost, l.vatAmount, lineTotal]
        );
        const movId = generateId();
        await tx.runAsync(
          "INSERT INTO local_stock_movements (id, product_client_id, product_name, kind, delta, ref_id, reason, created_at) VALUES (?,?,?,?,?,?,?,?)",
          [movId, l.productClientId, l.productName, "purchase", l.quantity, id, null, createdAt]
        );
        savedItems.push({ id: itemId, purchaseId: id, productClientId: l.productClientId, productName: l.productName, sku: l.sku ?? null, quantity: l.quantity, unitCost: l.unitCost, vatAmount: l.vatAmount, lineTotal });
      }
    });
    return {
      purchase: { id, supplierName: data.supplierName, referenceNumber: data.referenceNumber ?? null, receivedAt: createdAt, notes: data.notes ?? null, subtotal, vatAmount, total, itemCount: savedItems.length, createdAt },
      items: savedItems,
    };
  }, [db]);

  const loadLocalMovements = useCallback(async (productClientId?: string): Promise<LocalStockMovement[]> => {
    const rows = productClientId
      ? await db.getAllAsync<any>("SELECT * FROM local_stock_movements WHERE product_client_id=? ORDER BY created_at DESC LIMIT 200", [productClientId])
      : await db.getAllAsync<any>("SELECT * FROM local_stock_movements ORDER BY created_at DESC LIMIT 200");
    return rows.map((r) => ({
      id: r.id, productClientId: r.product_client_id, productName: r.product_name,
      kind: r.kind as LocalStockMovement["kind"], delta: r.delta, refId: r.ref_id, reason: r.reason, createdAt: r.created_at,
    }));
  }, [db]);

  const createLocalAdjustment = useCallback(async (data: {
    productClientId: string; productName: string; sku?: string | null; delta: number; reason?: string | null;
  }): Promise<LocalStockMovement> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync(
      "INSERT INTO local_stock_movements (id, product_client_id, product_name, kind, delta, ref_id, reason, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [id, data.productClientId, data.productName, "adjustment", data.delta, id, data.reason ?? null, createdAt]
    );
    return { id, productClientId: data.productClientId, productName: data.productName, kind: "adjustment", delta: data.delta, refId: id, reason: data.reason ?? null, createdAt };
  }, [db]);

  // ---- Prepaid packages (saloon mode) ----
  const loadPackages = useCallback(async (): Promise<import("@/types").PrepaidPackage[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM packages ORDER BY name ASC");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, description: r.description ?? "",
      totalSessions: r.total_sessions, price: r.price,
      applicableServiceIds: r.applicable_service_ids ? JSON.parse(r.applicable_service_ids) : null,
      isActive: !!r.is_active, createdAt: r.created_at,
    }));
  }, [db]);

  const createPackage = useCallback(async (pkg: Omit<import("@/types").PrepaidPackage, "id" | "createdAt">): Promise<import("@/types").PrepaidPackage> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync(
      "INSERT INTO packages (id, name, description, total_sessions, price, applicable_service_ids, is_active, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [id, pkg.name, pkg.description, pkg.totalSessions, pkg.price,
       pkg.applicableServiceIds ? JSON.stringify(pkg.applicableServiceIds) : null,
       pkg.isActive ? 1 : 0, createdAt]
    );
    return { id, ...pkg, createdAt };
  }, [db]);

  const updatePackage = useCallback(async (pkg: import("@/types").PrepaidPackage): Promise<void> => {
    await db.runAsync(
      "UPDATE packages SET name=?, description=?, total_sessions=?, price=?, applicable_service_ids=?, is_active=? WHERE id=?",
      [pkg.name, pkg.description, pkg.totalSessions, pkg.price,
       pkg.applicableServiceIds ? JSON.stringify(pkg.applicableServiceIds) : null,
       pkg.isActive ? 1 : 0, pkg.id]
    );
  }, [db]);

  const deletePackage = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("UPDATE packages SET is_active=0 WHERE id=?", [id]);
  }, [db]);

  const loadCustomerPackages = useCallback(async (customerId: string): Promise<import("@/types").CustomerPackage[]> => {
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM customer_packages WHERE customer_id=? ORDER BY purchased_at DESC", [customerId]
    );
    return rows.map((r: any) => ({
      id: r.id, packageId: r.package_id, customerId: r.customer_id,
      customerName: r.customer_name, packageName: r.package_name,
      totalSessions: r.total_sessions, usedSessions: r.used_sessions,
      purchaseSaleId: r.purchase_sale_id ?? null,
      purchasedAt: r.purchased_at, expiresAt: r.expires_at ?? null, isActive: !!r.is_active,
    }));
  }, [db]);

  const purchaseCustomerPackage = useCallback(async (data: {
    packageId: string; customerId: string; customerName: string; packageName: string;
    totalSessions: number; purchaseSaleId?: string | null; expiresAt?: number | null;
  }): Promise<import("@/types").CustomerPackage> => {
    const id = generateId();
    const purchasedAt = Date.now();
    await db.runAsync(
      "INSERT INTO customer_packages (id, package_id, customer_id, customer_name, package_name, total_sessions, used_sessions, purchase_sale_id, purchased_at, expires_at, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, data.packageId, data.customerId, data.customerName, data.packageName,
       data.totalSessions, 0, data.purchaseSaleId ?? null,
       purchasedAt, data.expiresAt ?? null, 1]
    );
    return {
      id, packageId: data.packageId, customerId: data.customerId,
      customerName: data.customerName, packageName: data.packageName,
      totalSessions: data.totalSessions, usedSessions: 0,
      purchaseSaleId: data.purchaseSaleId ?? null,
      purchasedAt, expiresAt: data.expiresAt ?? null, isActive: true,
    };
  }, [db]);

  const redeemPackageSession = useCallback(async (customerPackageId: string): Promise<void> => {
    await db.runAsync(
      "UPDATE customer_packages SET used_sessions = MIN(used_sessions + 1, total_sessions) WHERE id=?",
      [customerPackageId]
    );
  }, [db]);

  // ---- Laundry orders (laundry mode) ----

  const createLaundryOrder = useCallback(async (data: Parameters<import("./DatabaseCore").DatabaseContextValue["createLaundryOrder"]>[0]): Promise<import("@/types").LaundryOrder> => {
    const id = generateId();
    const now = Date.now();
    let ticketNumber = "";
    await db.withExclusiveTransactionAsync(async (tx) => {
      const counter = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM laundry_counter WHERE id=1");
      const seq = counter?.next_value ?? 1;
      await tx.runAsync("UPDATE laundry_counter SET next_value=? WHERE id=1", [seq + 1]);
      ticketNumber = `LDR-${String(seq).padStart(4, "0")}`;
      await tx.runAsync(
        `INSERT INTO laundry_orders
          (id, ticket_number, customer_id, customer_name, customer_phone, status,
           promised_at, order_type, notes, subtotal, vat_amount, total,
           paid_at, payment_method, sale_id, staff_id, staff_name, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?)`,
        [id, ticketNumber, data.customerId, data.customerName, data.customerPhone,
         "received", data.promisedAt, data.orderType, data.notes ?? null,
         data.subtotal, data.vatAmount, data.total,
         data.staffId ?? null, data.staffName ?? null, now, now]
      );
      for (const item of data.items) {
        const itemId = generateId();
        await tx.runAsync(
          "INSERT INTO laundry_order_items (id, order_id, product_id, product_name, product_price, quantity, line_total, notes) VALUES (?,?,?,?,?,?,?,?)",
          [itemId, id, item.productId, item.productName, item.productPrice, item.quantity, item.lineTotal, item.notes ?? null]
        );
      }
    });
    return {
      id, ticketNumber,
      customerId: data.customerId, customerName: data.customerName, customerPhone: data.customerPhone,
      status: "received" as const, promisedAt: data.promisedAt, orderType: data.orderType,
      notes: data.notes ?? null, subtotal: data.subtotal, vatAmount: data.vatAmount, total: data.total,
      paidAt: null, paymentMethod: null, saleId: null,
      staffId: data.staffId ?? null, staffName: data.staffName ?? null,
      createdAt: now, updatedAt: now,
      items: data.items.map((it, i) => ({
        id: `${id}_${i}`, orderId: id, productId: it.productId, productName: it.productName,
        productPrice: it.productPrice, quantity: it.quantity, lineTotal: it.lineTotal, notes: it.notes ?? null,
      })),
    };
  }, [db]);

  const loadLaundryOrders = useCallback(async (statusFilter?: import("@/types").LaundryOrderStatus[]): Promise<import("@/types").LaundryOrder[]> => {
    let sql = "SELECT * FROM laundry_orders";
    const args: string[] = [];
    if (statusFilter && statusFilter.length > 0) {
      sql += ` WHERE status IN (${statusFilter.map(() => "?").join(",")})`;
      args.push(...statusFilter);
    }
    sql += " ORDER BY created_at DESC";
    const orders = await db.getAllAsync<any>(sql, args);
    if (orders.length === 0) return [];
    const allItems = await db.getAllAsync<any>(
      `SELECT * FROM laundry_order_items WHERE order_id IN (${orders.map(() => "?").join(",")})`,
      orders.map((o: any) => o.id)
    );
    const itemsByOrder: Record<string, import("@/types").LaundryOrderItem[]> = {};
    for (const r of allItems) {
      (itemsByOrder[r.order_id] ??= []).push({
        id: r.id, orderId: r.order_id, productId: r.product_id, productName: r.product_name,
        productPrice: r.product_price, quantity: r.quantity, lineTotal: r.line_total, notes: r.notes ?? null,
      });
    }
    return orders.map((r: any) => ({
      id: r.id, ticketNumber: r.ticket_number,
      customerId: r.customer_id, customerName: r.customer_name, customerPhone: r.customer_phone,
      status: r.status as import("@/types").LaundryOrderStatus, promisedAt: r.promised_at,
      orderType: r.order_type as "drop-off" | "express", notes: r.notes ?? null,
      subtotal: r.subtotal, vatAmount: r.vat_amount, total: r.total,
      paidAt: r.paid_at ?? null, paymentMethod: r.payment_method ?? null, saleId: r.sale_id ?? null,
      staffId: r.staff_id ?? null, staffName: r.staff_name ?? null,
      createdAt: r.created_at, updatedAt: r.updated_at,
      items: itemsByOrder[r.id] ?? [],
    }));
  }, [db]);

  const updateLaundryOrderStatus = useCallback(async (orderId: string, status: import("@/types").LaundryOrderStatus): Promise<void> => {
    await db.runAsync(
      "UPDATE laundry_orders SET status=?, updated_at=? WHERE id=?",
      [status, Date.now(), orderId]
    );
  }, [db]);

  const collectLaundryOrder = useCallback(async (orderId: string, saleId: string, paymentMethod: string): Promise<void> => {
    const now = Date.now();
    await db.runAsync(
      "UPDATE laundry_orders SET status='collected', sale_id=?, paid_at=?, payment_method=?, updated_at=? WHERE id=?",
      [saleId, now, paymentMethod, now, orderId]
    );
  }, [db]);

  const getLaundryOrder = useCallback(async (id: string): Promise<import("@/types").LaundryOrder | null> => {
    const r = await db.getFirstAsync<any>("SELECT * FROM laundry_orders WHERE id=?", [id]);
    if (!r) return null;
    const items = await db.getAllAsync<any>("SELECT * FROM laundry_order_items WHERE order_id=?", [id]);
    return {
      id: r.id, ticketNumber: r.ticket_number,
      customerId: r.customer_id, customerName: r.customer_name, customerPhone: r.customer_phone,
      status: r.status as import("@/types").LaundryOrderStatus, promisedAt: r.promised_at,
      orderType: r.order_type as "drop-off" | "express", notes: r.notes ?? null,
      subtotal: r.subtotal, vatAmount: r.vat_amount, total: r.total,
      paidAt: r.paid_at ?? null, paymentMethod: r.payment_method ?? null, saleId: r.sale_id ?? null,
      staffId: r.staff_id ?? null, staffName: r.staff_name ?? null,
      createdAt: r.created_at, updatedAt: r.updated_at,
      items: items.map((it: any) => ({
        id: it.id, orderId: it.order_id, productId: it.product_id, productName: it.product_name,
        productPrice: it.product_price, quantity: it.quantity, lineTotal: it.line_total, notes: it.notes ?? null,
      })),
    };
  }, [db]);

  return (
    <DatabaseContext.Provider value={{
      loadProducts, createProduct, updateProduct, deleteProduct, updateStock,
      saveSale, loadSales, loadSaleWithItems, loadSaleByInvoiceNumber, loadSalesWithItemsByDateRange, processRefund,
      loadBusinessSettings, saveBusinessSettings,
      loadCustomers, createCustomer, updateCustomer, deleteCustomer,
      recordCreditPayment, loadCreditPayments, updateLoyaltyPoints,
      loadStaff, createStaff, updateStaff, deleteStaff, authenticateStaff,
      loadTables, createTable, updateTable, deleteTable, setTableStatus,
      loadTaxGroups, createTaxGroup, updateTaxGroup, deleteTaxGroup,
      loadCategories, createCategory, updateCategory, deleteCategory,
      loadSplitPayments, saveZReport, loadZReports,
      loadRiders, createRider, updateRider, deleteRider,
      loadAppointments, createAppointment, updateAppointment, updateAppointmentStatus, deleteAppointment,
      saveHeldOrder, loadHeldOrders, loadHeldOrderByTable, deleteHeldOrder, updateKdsStatus,
      loadIngredients, createIngredient, updateIngredient, deleteIngredient, updateIngredientStock,
      loadRecipeIngredients, saveRecipeIngredients, deleteRecipeIngredients,
      loadModifierGroups, loadAllModifierGroups, saveModifierGroups,
      exportData, importData, clearData,
      loadExpenses, createExpense, deleteExpense,
      enqueueSync, reconcilePendingSync, loadSyncBatch, markSyncResults, countPendingSync,
      loadCatalogBatch, markCatalogResults, countPendingCatalog, applyRemoteCatalog,
      loadSyncQueue, loadCatalogOutbox, dismissSyncItem, dismissCatalogItem,
      insertSyncLog, loadSyncLogs, clearSyncLogs,
      loadLocalSuppliers, createLocalSupplier, updateLocalSupplier,
      loadLocalPurchases, getLocalPurchase, createLocalPurchase,
      loadLocalMovements, createLocalAdjustment,
      loadPackages, createPackage, updatePackage, deletePackage,
      loadCustomerPackages, purchaseCustomerPackage, redeemPackageSession,
      createLaundryOrder, loadLaundryOrders, updateLaundryOrderStatus, collectLaundryOrder, getLaundryOrder,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}

/**
 * UPSERT a catalog outbox row inside an existing transaction. Typed loosely
 * because expo-sqlite's `Transaction` shape is stricter than we need here
 * and we always pass the same db-vended object.
 */
async function enqueueCatalogTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  entityType: "product" | "category" | "customer",
  entityId: string,
  payload: unknown,
  deleted: boolean,
  updatedAt: number,
): Promise<void> {
  // ON CONFLICT REPLACE: when a product is edited multiple times before
  // a successful push, the latest snapshot wins and attempt_count resets
  // to 0 so we don't carry stale backoff over a fresh edit.
  await tx.runAsync(
    `INSERT INTO catalog_outbox
       (id, entity_type, entity_id, payload, deleted, updated_at, enqueued_at, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       payload=excluded.payload,
       deleted=excluded.deleted,
       updated_at=excluded.updated_at,
       enqueued_at=excluded.enqueued_at,
       attempt_count=0,
       last_attempt_at=NULL,
       last_error=NULL`,
    [generateId(), entityType, entityId, JSON.stringify(payload),
     deleted ? 1 : 0, updatedAt, Date.now()]
  );
  // Wake the SyncContext loop for catalog edits too. Harmless on rollback.
  notifySyncQueueChanged();
}

/**
 * Look up pending outbox `updated_at` for a set of (entityType, entityId)
 * keys in one pass. Returns a map keyed `"<type>:<id>"`. We intentionally
 * read `updated_at` (not `enqueued_at`): the LWW comparison is against the
 * client wall-clock the user wrote, which is what the server sees too.
 */
async function loadOutboxIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  keys: ReadonlyArray<readonly [string, string]>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (keys.length === 0) return out;
  // SQLite has a default 999 host-parameter limit and we batch up to 500
  // products + 500 categories from the puller, so worst-case ~2000 binds.
  // Chunk to stay safely under the limit.
  const CHUNK = 400;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "(?, ?)").join(",");
    const args: unknown[] = [];
    for (const [t, id] of slice) { args.push(t); args.push(id); }
    const rows = await tx.getAllAsync(
      `SELECT entity_type, entity_id, updated_at FROM catalog_outbox
       WHERE (entity_type, entity_id) IN (VALUES ${placeholders})`,
      args
    ) as Array<{ entity_type: string; entity_id: string; updated_at: number }>;
    for (const r of rows) out.set(`${r.entity_type}:${r.entity_id}`, r.updated_at);
  }
  return out;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
