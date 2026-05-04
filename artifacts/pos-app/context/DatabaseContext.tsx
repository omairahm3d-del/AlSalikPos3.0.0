import React, { useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type {
  BusinessSettings, CartItem, Category, CreditPayment, Customer,
  HeldOrder, HeldOrderItem, Ingredient, PosTable, Product,
  RecipeIngredient, Rider, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { DatabaseContext, type SaleOptions } from "./DatabaseCore";

export function NativeDatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM products ORDER BY category, name");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, category: r.category, price: r.price,
      description: r.description ?? "", colorHex: r.color_hex ?? "#4F8EF7",
      barcode: r.barcode ?? undefined, stockQuantity: r.stock_quantity ?? 999,
      taxGroupId: r.tax_group_id ?? undefined, lowStockThreshold: r.low_stock_threshold ?? 10,
      imageUri: r.image_uri ?? undefined,
    }));
  }, [db]);

  const createProduct = useCallback(async (product: Omit<Product, "id">): Promise<Product> => {
    const id = generateId();
    await db.runAsync(
      "INSERT INTO products (id, name, category, price, description, color_hex, barcode, stock_quantity, tax_group_id, low_stock_threshold, image_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null, product.stockQuantity, product.taxGroupId ?? null, product.lowStockThreshold, product.imageUri ?? null]
    );
    return { ...product, id };
  }, [db]);

  const updateProduct = useCallback(async (product: Product): Promise<void> => {
    await db.runAsync(
      "UPDATE products SET name=?, category=?, price=?, description=?, color_hex=?, barcode=?, stock_quantity=?, tax_group_id=?, low_stock_threshold=?, image_uri=? WHERE id=?",
      [product.name, product.category, product.price, product.description, product.colorHex, product.barcode ?? null, product.stockQuantity, product.taxGroupId ?? null, product.lowStockThreshold, product.imageUri ?? null, product.id]
    );
  }, [db]);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM products WHERE id=?", [id]);
  }, [db]);

  const updateStock = useCallback(async (productId: string, delta: number): Promise<void> => {
    await db.runAsync("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id=?", [delta, productId]);
  }, [db]);

  const saveSale = useCallback(async (items: CartItem[], options: SaleOptions): Promise<Sale> => {
    const { paymentMethod, orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName, discountType, discountValue, discountAmount: orderDiscount, loyaltyPointsRedeemed, splitPayments } = options;

    if (paymentMethod === "Credit" && !customerId) throw new Error("Credit sales require a customer");

    let subtotal = 0;
    for (const item of items) {
      const lineBase = item.product.price * item.quantity;
      const itemDisc = item.discountAmount ?? 0;
      subtotal += lineBase - itemDisc;
    }
    const orderDiscAmt = orderDiscount ?? 0;
    const rawSubtotal = subtotal;
    subtotal = subtotal - orderDiscAmt;
    if (subtotal < 0) subtotal = 0;
    let vatAmount = 0;
    const discountRatio = rawSubtotal > 0 ? subtotal / rawSubtotal : 0;
    for (const item of items) {
      const lineAfterDisc = item.product.price * item.quantity - (item.discountAmount ?? 0);
      const rate = item.taxRate ?? VAT_RATE;
      vatAmount += Math.max(0, lineAfterDisc) * rate * discountRatio;
    }
    const total = subtotal + vatAmount;
    const saleId = generateId();
    const createdAt = Date.now();

    return await db.withExclusiveTransactionAsync(async (tx) => {
      const counterRow = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM invoice_counter WHERE id=1");
      const seq = counterRow?.next_value ?? 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1);
      await tx.runAsync("UPDATE invoice_counter SET next_value=next_value+1 WHERE id=1");

      const pointsEarned = customerId ? Math.floor(total) : 0;
      const effectiveVatRate = subtotal > 0 ? vatAmount / subtotal : VAT_RATE;

      await tx.runAsync(
        `INSERT INTO sales (id, invoice_number, created_at, subtotal, vat_rate, vat_amount, total, payment_method,
         order_type, customer_id, customer_name, staff_id, staff_name, table_id, table_name,
         rider_id, rider_name, discount_type, discount_value, discount_amount, is_refund, original_sale_id,
         loyalty_points_earned, loyalty_points_redeemed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?)`,
        [saleId, invoiceNumber, createdAt, subtotal, effectiveVatRate, vatAmount, total, paymentMethod,
         orderType ?? null, customerId ?? null, customerName ?? null, staffId ?? null, staffName ?? null,
         tableId ?? null, tableName ?? null, riderId ?? null, riderName ?? null,
         discountType ?? null, discountValue ?? null, orderDiscAmt, pointsEarned, loyaltyPointsRedeemed ?? 0]
      );

      for (const item of items) {
        const itemId = generateId();
        const lineTotal = item.product.price * item.quantity - (item.discountAmount ?? 0);
        await tx.runAsync(
          "INSERT INTO sale_items (id, sale_id, product_id, product_name, product_price, quantity, line_total, discount_amount) VALUES (?,?,?,?,?,?,?,?)",
          [itemId, saleId, item.product.id, item.product.name, item.product.price, item.quantity, lineTotal, item.discountAmount ?? 0]
        );
        await tx.runAsync("UPDATE products SET stock_quantity=stock_quantity-? WHERE id=?", [item.quantity, item.product.id]);
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
        await tx.runAsync("UPDATE customers SET loyalty_points=loyalty_points-? WHERE id=?", [loyaltyPointsRedeemed, customerId]);
      }

      if (tableId) {
        await tx.runAsync("UPDATE pos_tables SET status='available', current_order_id=NULL WHERE id=?", [tableId]);
        await tx.runAsync("DELETE FROM held_order_items WHERE held_order_id IN (SELECT id FROM held_orders WHERE table_id=?)", [tableId]);
        await tx.runAsync("DELETE FROM held_orders WHERE table_id=?", [tableId]);
      }

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

      return {
        id: saleId, invoiceNumber, createdAt, subtotal, vatRate: effectiveVatRate, vatAmount, total, paymentMethod,
        orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName,
        discountType, discountValue, discountAmount: orderDiscAmt,
        loyaltyPointsEarned: pointsEarned, loyaltyPointsRedeemed: loyaltyPointsRedeemed ?? 0,
        splitPayments,
      };
    });
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
  });

  const mapItemRow = (i: any): SaleItem => ({
    id: i.id, saleId: i.sale_id, productId: i.product_id,
    productName: i.product_name, productPrice: i.product_price,
    quantity: i.quantity, lineTotal: i.line_total, discountAmount: i.discount_amount ?? 0,
  });

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
    return await db.withExclusiveTransactionAsync(async (tx) => {
      const orig = await tx.getFirstAsync<any>("SELECT * FROM sales WHERE id=?", [originalSaleId]);
      if (!orig) throw new Error("Sale not found");
      if (orig.is_refund === 1) throw new Error("Cannot refund a refund");

      const existing = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM sales WHERE original_sale_id=? AND is_refund=1", [originalSaleId]);
      if (existing && existing.count > 0) throw new Error("Sale already refunded");

      const refundId = generateId();
      const createdAt = Date.now();
      const counterRow = await tx.getFirstAsync<{ next_value: number }>("SELECT next_value FROM invoice_counter WHERE id=1");
      const seq = counterRow?.next_value ?? 1;
      const invoiceNumber = generateInvoiceNumber(seq - 1);
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

      return {
        id: refundId, invoiceNumber, createdAt, subtotal: -orig.subtotal,
        vatRate: orig.vat_rate, vatAmount: -orig.vat_amount, total: -orig.total,
        paymentMethod: orig.payment_method, isRefund: true, originalSaleId,
        staffId: staffId ?? orig.staff_id, staffName: staffName ?? orig.staff_name,
      };
    });
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
      loyaltyPointsPerAed: parseFloat(map.loyaltyPointsPerAed || "1"),
      loyaltyRedemptionRate: parseFloat(map.loyaltyRedemptionRate || "0.01"),
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

    return base;
  }, [db]);

  const saveBusinessSettings = useCallback(async (settings: BusinessSettings): Promise<void> => {
    const entries: [string, string][] = [
      ["businessName", settings.businessName], ["trn", settings.trn],
      ["address", settings.address], ["phone", settings.phone], ["email", settings.email],
      ["loyaltyPointsPerAed", String(settings.loyaltyPointsPerAed)],
      ["loyaltyRedemptionRate", String(settings.loyaltyRedemptionRate)],
    ];
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
    }));
  }, [db]);

  const createCustomer = useCallback(async (customer: Omit<Customer, "id" | "creditBalance" | "loyaltyPoints" | "createdAt">): Promise<Customer> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync(
      "INSERT INTO customers (id, name, phone, email, company, credit_balance, loyalty_points, created_at) VALUES (?,?,?,?,?,0,0,?)",
      [id, customer.name, customer.phone, customer.email, customer.company, createdAt]
    );
    return { ...customer, id, creditBalance: 0, loyaltyPoints: 0, createdAt };
  }, [db]);

  const updateCustomer = useCallback(async (customer: Customer): Promise<void> => {
    await db.runAsync("UPDATE customers SET name=?, phone=?, email=?, company=? WHERE id=?",
      [customer.name, customer.phone, customer.email, customer.company, customer.id]);
  }, [db]);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    const c = await db.getFirstAsync<{ credit_balance: number }>("SELECT credit_balance FROM customers WHERE id=?", [id]);
    if (c && c.credit_balance > 0) throw new Error("Cannot delete customer with outstanding balance");
    await db.runAsync("DELETE FROM customers WHERE id=?", [id]);
  }, [db]);

  const recordCreditPayment = useCallback(async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
    if (amount <= 0) throw new Error("Payment amount must be positive");
    const id = generateId();
    const createdAt = Date.now();
    return await db.withExclusiveTransactionAsync(async (tx) => {
      const c = await tx.getFirstAsync<{ credit_balance: number }>("SELECT credit_balance FROM customers WHERE id=?", [customerId]);
      if (!c) throw new Error("Customer not found");
      if (amount > c.credit_balance) throw new Error("Payment exceeds outstanding balance");
      await tx.runAsync("INSERT INTO credit_payments (id, customer_id, amount, note, created_at) VALUES (?,?,?,?,?)", [id, customerId, amount, note, createdAt]);
      await tx.runAsync("UPDATE customers SET credit_balance=credit_balance-? WHERE id=?", [amount, customerId]);
      return { id, customerId, amount, note, createdAt };
    });
  }, [db]);

  const loadCreditPayments = useCallback(async (customerId: string): Promise<CreditPayment[]> => {
    const rows = await db.getAllAsync<any>("SELECT * FROM credit_payments WHERE customer_id=? ORDER BY created_at DESC", [customerId]);
    return rows.map((r: any) => ({ id: r.id, customerId: r.customer_id, amount: r.amount, note: r.note ?? "", createdAt: r.created_at }));
  }, [db]);

  const updateLoyaltyPoints = useCallback(async (customerId: string, delta: number): Promise<void> => {
    await db.runAsync("UPDATE customers SET loyalty_points=MAX(0, loyalty_points+?) WHERE id=?", [delta, customerId]);
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
    }));
  }, [db]);

  const createCategory = useCallback(async (category: Omit<Category, "id">): Promise<Category> => {
    const id = generateId();
    await db.runAsync(
      "INSERT INTO categories (id, name, color_hex, image_uri, sort_order) VALUES (?,?,?,?,?)",
      [id, category.name, category.colorHex, category.imageUri ?? null, category.sortOrder]
    );
    return { ...category, id };
  }, [db]);

  const updateCategory = useCallback(async (category: Category): Promise<void> => {
    await db.runAsync(
      "UPDATE categories SET name=?, color_hex=?, image_uri=?, sort_order=? WHERE id=?",
      [category.name, category.colorHex, category.imageUri ?? null, category.sortOrder, category.id]
    );
  }, [db]);

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM categories WHERE id=?", [id]);
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
    }));
  }, [db]);

  const createRider = useCallback(async (rider: Omit<Rider, "id" | "active" | "createdAt">): Promise<Rider> => {
    const id = generateId();
    const createdAt = Date.now();
    await db.runAsync("INSERT INTO riders (id, name, phone, vehicle_info, active, created_at) VALUES (?,?,?,?,1,?)",
      [id, rider.name, rider.phone, rider.vehicleInfo, createdAt]);
    return { ...rider, id, active: true, createdAt };
  }, [db]);

  const updateRider = useCallback(async (rider: Rider): Promise<void> => {
    await db.runAsync("UPDATE riders SET name=?, phone=?, vehicle_info=?, active=? WHERE id=?",
      [rider.name, rider.phone, rider.vehicleInfo, rider.active ? 1 : 0, rider.id]);
  }, [db]);

  const deleteRider = useCallback(async (id: string): Promise<void> => {
    await db.runAsync("DELETE FROM riders WHERE id=?", [id]);
  }, [db]);

  const saveHeldOrder = useCallback(async (order: Omit<HeldOrder, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<HeldOrder> => {
    const now = Date.now();
    const isUpdate = !!order.id;
    const id = order.id || generateId();

    if (isUpdate) {
      await db.runAsync("UPDATE held_orders SET table_id=?, table_name=?, order_type=?, staff_id=?, staff_name=?, customer_id=?, customer_name=?, updated_at=? WHERE id=?",
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
      saveHeldOrder, loadHeldOrders, loadHeldOrderByTable, deleteHeldOrder,
      loadIngredients, createIngredient, updateIngredient, deleteIngredient, updateIngredientStock,
      loadRecipeIngredients, saveRecipeIngredients, deleteRecipeIngredients,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
