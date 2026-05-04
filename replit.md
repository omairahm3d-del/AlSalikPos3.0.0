# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## POS App (`artifacts/pos-app`)

Mobile-first Point of Sale app built with Expo (SDK 54) and React Native, configured for UAE standards. Full Aronium Pro feature set.

### UAE Compliance
- **VAT Rate**: 5% (UAE Federal Tax Authority standard)
- **Currency**: AED (UAE Dirham), formatted as `AED XX.XX` via `formatCurrency()` helper
- **Tax Invoices**: UAE-compliant Simplified Tax Invoice format with bilingual header (Arabic/English)
- **TRN**: Tax Registration Number field (15-digit FTA format) with validation
- **Invoice Numbering**: Sequential atomic counter (format: `INV-YYYYMMDD-XXXX`) with unique constraint
- **Receipt Printing**: expo-print for thermal/PDF output; expo-sharing for PDF export

### Features (Aronium Pro Feature Set)
- **Offline SQLite database** (expo-sqlite ~16.0.10) on native; AsyncStorage fallback on web
- **Product catalog** — 18 seed products across 4 categories (Beverages, Food, Snacks, Desserts) with AED prices
- **Inventory/Stock Tracking** — stock quantity per product, auto-decrement on sale, low stock threshold alerts, out-of-stock badges
- **Discount Management** — per-item discount (%, fixed AED), per-order discount, discount reflected in totals, receipts, and reports
- **Employee/Staff PIN Login** — staff entity with name/role/PIN, lock screen with PIN pad, staff name on receipts and sales, admin/cashier roles
- **Table Management** — create/edit/delete tables, capacity tracking, status cycling (available → occupied → reserved), assign orders to tables
- **Kitchen/Order Tickets** — HTML kitchen ticket template with table number, order number, item list; auto-prints when a table is assigned to the order (expo-print on native, window.print on web); print failures surfaced to staff
- **Split Payment** — split payment across Card/Cash/Credit with custom amounts per method, tracked in split_payments table
- **Refunds & Returns** — full refund from sale history, creates negative sale entry, restores stock, reverses credit/loyalty, refund badges in history
- **Tax Group Management** — create custom tax groups (e.g. zero-rated, exempt), assign per product, default 5% UAE VAT; per-item tax rate applied in cart/checkout/saveSale (weighted average VAT rate stored on sale record)
- **Loyalty Points / Rewards** — configurable points per AED spent, configurable redemption rate, points earned on sale, redeem as discount at checkout; customer selectable for any payment method (not just credit), loyalty redemption UI shows available points and AED value
- **Z-Report (End of Day)** — close register with actual cash in drawer, full day summary (revenue, refunds, VAT, discounts, payment breakdown, staff sales, category breakdown)
- **Product search bar** — real-time text filter on Register screen by product name or barcode
- **Barcode scanner** — uses expo-camera ~17.0.10; scans EAN-13/8, UPC-A/E, QR, Code128/39
- **Shopping cart** with 5% VAT calculation, subtotal, grand total in AED
- **4 payment methods** — Card, Cash, Credit, Split (credit requires customer selection)
- **Customer management** — create/edit/delete customers with name, phone, email, company, loyalty points display
- **Credit payment system** — sell on credit linked to a customer, tracks outstanding balances, record payments to collect credit
- **Sales history** with per-day grouping, stats, refund button, and receipt printing from any past sale
- **Daily sales report** — date-navigable report with revenue, transactions, avg order, VAT, discounts, refunds, hourly sales chart, top-selling products, revenue by category, payment method breakdown, sales by staff
- **Business settings** — business name, TRN, address, phone, email, loyalty points configuration
- **UAE tax invoice receipts** — print/share receipts with Arabic header, TRN, invoice number, itemized VAT, discount lines, staff name, table info
- **Dark UI theme** (`#0F1117` background) — designed for 10-inch tablets
- **Split-panel layout** on screens ≥768px wide; single-panel + bottom cart bar on mobile

### Performance Optimizations (Register/Homepage)
- **React.memo** on ProductCard, CartItemRow, CategoryFilter — prevents unnecessary re-renders
- **Stable callbacks** — ProductCard uses `onAdd(productId)` (stable ref) instead of `onPress={() => ...}` (new closure per render); CartItemRow receives `updateQuantity`/`removeItem` as props instead of consuming context directly
- **CartContext memoization** — all dispatch actions wrapped in `useCallback`, provider value wrapped in `useMemo`, `quantityMap` (Record<id, qty>) for O(1) lookups
- **FlatList tuning** — `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews` (native only), `getItemLayout` on tablet grid
- **Memoized derived values** — `availableTables`, `filteredProducts`, `SearchBar`, `ScanButton` all wrapped in `useMemo`; all handlers use `useCallback`
- **Visual stock indicators** — out-of-stock products show dark overlay with "OUT OF STOCK" text + dimmed opacity; low-stock products show amber "X left" badge

### Tabs (6 total)
1. **Register** (`index.tsx`) — POS grid + search + cart + barcode scan + payment modal (Card/Cash/Credit/Split) + per-item discounts + order discount + table/staff/customer selection + receipt
2. **Tables** (`tables.tsx`) — table grid with status badges, create/edit/delete, capacity, status cycling
3. **History** (`history.tsx`) — transaction list with today's stats, refund button, refund/refunded badges, print receipt
4. **Customers** (`customers.tsx`) — customer list with credit balances + loyalty points, create/edit/delete, payment collection, credit sale history
5. **Reports** (`reports.tsx`) — daily sales report + staff management modal + tax groups modal + Z-report close register + business settings
6. **Products** (`products.tsx`) — CRUD product management + stock tracking + low stock filter + tax group picker + barcode assignment

### Key Files
- `types/index.ts` — All entities: Product (with stockQuantity, taxGroupId, lowStockThreshold), CartItem (with discountAmount), Sale (with staff/table/discount/refund/loyalty fields), SaleItem, Customer (with loyaltyPoints), CreditPayment, BusinessSettings (with loyalty config), Staff, PosTable, TaxGroup, SplitPaymentEntry, ZReport
- `lib/database.ts` — SQLite init with all tables: products, sales, sale_items, settings, customers, credit_payments, staff, pos_tables, tax_groups, split_payments, z_reports, invoice_counter
- `lib/receiptTemplate.ts` — HTML receipt generator for UAE Simplified Tax Invoice with discount/staff/refund/table support
- `lib/kitchenTicketTemplate.ts` — HTML kitchen ticket template with table number, order items, timestamps
- `context/DatabaseCore.ts` — shared DatabaseContextValue interface with SaleOptions type, all CRUD methods
- `context/DatabaseContext.tsx` — SQLite (native) provider with exclusive transactions, atomic invoice counter
- `context/WebDatabaseProvider.tsx` — AsyncStorage (web) provider with all methods matching native provider
- `context/CartContext.tsx` — cart reducer with SET_ITEM_DISCOUNT action, item discount computation, per-item tax rate tracking, order discount support
- `context/StaffContext.tsx` — staff login/logout, PIN authentication, staffRequired state, auto-lock
- `components/LockScreen.tsx` — PIN pad lock screen for staff authentication
- `components/ReceiptModal.tsx` — UAE tax invoice preview with print/share
- `components/BusinessSettingsModal.tsx` — TRN validation, business info editor, loyalty config
- `components/BarcodeScannerModal.tsx` — full-screen camera scanner
- `components/CustomerSelectModal.tsx` — search/select/create customer during checkout
- `components/SaleCard.tsx` — sale display with refund/refunded badges, staff/table/discount info

### Dark Theme Colors
- Background: `#0F1117`
- Card: `#1A1D25`
- Primary: `#4F8EF7`
- Success: `#2ECC71`
- Destructive: `#E74C3C`
- Warning: `#F39C12`

### APK Build (Android)
- EAS CLI installed (`eas-cli` in devDependencies)
- Config: `eas.json` with `preview` profile (APK) and `production` profile (AAB)
- Build command: `cd artifacts/pos-app && pnpm exec eas build --platform android --profile preview`
- Requires free Expo account — run `pnpm exec eas login` first

### Platform Notes
- Barcode scanning requires a physical device (Expo Go on Android/iOS)
- Web preview shows "Camera unavailable" fallback in the scanner modal
- `metro.config.js` blocks `_tmp_` dirs to prevent Metro watcher crash
- Tab bar uses normal flow positioning (not absolute) to avoid content overlap
- Receipt printing on web opens a new print window; on native uses expo-print

## Desktop App (`desktop-app/`)

Standalone Electron 22.x wrapper for Windows 8.1+ desktop deployment. Not a workspace package — it's a separate npm project that wraps the Expo web build.

### Architecture
- **Electron 22.3.27** — last version supporting Windows 8.1 (Chromium 108, Node.js 16.17.1)
- **electron-builder 24.13.3** — creates NSIS installer (.exe) for Windows x64 and ia32
- Loads the static Expo web export from `web-build/` directory
- Auto-fixes absolute asset paths (`/_expo/...` → `./_expo/...`) on launch for `file://` protocol compatibility
- Data stored in localStorage (via AsyncStorage web implementation) — fully offline
- No server required — everything runs locally

### Build Process
1. Export Expo web build: `npm run build:web` (runs `expo export --platform web`)
2. Build Windows installer: `npm run build:win` (runs electron-builder)
3. Or run both: `npm run build` or use `build.sh` (Linux/macOS) / `build.bat` (Windows)
4. Output: `desktop-app/dist/` contains the .exe installer

### Key Files
- `package.json` — standalone npm project with electron 22.3.27 + electron-builder
- `main.js` — Electron main process: window management, menu, file loading
- `electron-builder.yml` — NSIS installer config for Windows x64/ia32
- `build.sh` / `build.bat` — automated build scripts
- `build-resources/` — place icon.ico and icon.png here for branding

### Build Commands
- `npm run start` — run desktop app in development (requires web-build/)
- `npm run build:web` — export Expo web build
- `npm run build:win` — build Windows NSIS installer
- `npm run build:win-portable` — build portable .exe (no install needed)
- `npm run build` — full build (web export + Windows installer)

### Requirements for Building
- Node.js 16+ (for Electron 22 compatibility)
- npm (not pnpm — standalone project)
- For Windows builds on Linux/macOS: Wine may be needed for cross-compilation
- For production builds: place icon.ico in build-resources/
