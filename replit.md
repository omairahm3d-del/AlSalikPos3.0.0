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

Mobile-first Point of Sale app built with Expo (SDK 54) and React Native, configured for UAE standards.

### UAE Compliance
- **VAT Rate**: 5% (UAE Federal Tax Authority standard)
- **Currency**: AED (UAE Dirham), formatted as `AED XX.XX` via `formatCurrency()` helper
- **Tax Invoices**: UAE-compliant Simplified Tax Invoice format with bilingual header (Arabic/English)
- **TRN**: Tax Registration Number field (15-digit FTA format) with validation
- **Invoice Numbering**: Sequential atomic counter (format: `INV-YYYYMMDD-XXXX`) with unique constraint
- **Receipt Printing**: expo-print for thermal/PDF output; expo-sharing for PDF export

### Features
- **Offline SQLite database** (expo-sqlite ~16.0.10) on native; AsyncStorage fallback on web
- **Product catalog** — 18 seed products across 4 categories (Beverages, Food, Snacks, Desserts) with AED prices
- **Product search bar** — real-time text filter on Register screen by product name or barcode
- **Barcode scanner** — uses expo-camera ~17.0.10; scans EAN-13/8, UPC-A/E, QR, Code128/39
  - Register screen: scan to instantly add product to cart
  - Products screen: assign mode to link a barcode to any product
- **Shopping cart** with 5% VAT calculation, subtotal, grand total in AED
- **3 payment methods** — Card, Cash, Credit (credit requires customer selection)
- **Customer management** — create/edit/delete customers with name, phone, email, company
- **Credit payment system** — sell on credit linked to a customer, tracks outstanding balances, record payments to collect credit
- **Sales history** with per-day grouping, stats, and receipt printing from any past sale
- **Daily sales report** — date-navigable report with revenue, transactions, avg order, VAT, hourly sales chart, top-selling products, revenue by category, payment method breakdown
- **Business settings** — accessible via gear icon on Reports screen; stores business name, TRN, address, phone, email
- **UAE tax invoice receipts** — print/share receipts with Arabic header "فاتورة ضريبية مبسطة", TRN, invoice number, itemized VAT; shows customer name on credit invoices
- **Dark UI theme** (`#0F1117` background) — designed for 10-inch tablets
- **Split-panel layout** on screens ≥768px wide; single-panel + bottom cart bar on mobile

### Tabs
1. **Register** (`index.tsx`) — POS grid + search bar + cart + barcode scan + Card/Cash/Credit payment + receipt after sale
2. **History** (`history.tsx`) — transaction list with today's stats + print receipt from any sale
3. **Customers** (`customers.tsx`) — customer list with credit balances, create/edit/delete, payment collection, credit sale history
4. **Reports** (`reports.tsx`) — daily sales report + settings gear icon for business config
5. **Products** (`products.tsx`) — CRUD product management + barcode assignment

### Key Files
- `types/index.ts` — Product, CartItem, Sale (with invoiceNumber, customerId, customerName), SaleItem, Customer, CreditPayment, BusinessSettings; VAT_RATE=0.05, CURRENCY="AED", formatCurrency()
- `lib/database.ts` — SQLite init with customers, credit_payments, settings, invoice_counter tables; migrations for customer_id/customer_name on sales
- `lib/receiptTemplate.ts` — HTML receipt generator for UAE Simplified Tax Invoice (80mm thermal format), includes customer name for credit sales
- `context/DatabaseCore.ts` — shared context with customer CRUD, recordCreditPayment, loadCreditPayments + all sale/product/settings methods
- `context/DatabaseContext.tsx` — SQLite (native) provider with exclusive transactions for credit operations, atomic invoice counter, data-layer validation
- `context/WebDatabaseProvider.tsx` — AsyncStorage (web) provider with customer/credit operations and validation
- `context/DatabaseProvider.native.tsx` / `.web.tsx` — platform dispatch
- `context/CartContext.tsx` — cart reducer with 5% VAT
- `components/ReceiptModal.tsx` — UAE tax invoice preview with customer name, print/share buttons and TRN warning
- `components/BusinessSettingsModal.tsx` — TRN validation (15-digit), business info editor
- `components/BarcodeScannerModal.tsx` — full-screen camera scanner with viewfinder UI
- `components/CustomerSelectModal.tsx` — search/select/create customer during credit checkout
- `components/SaleCard.tsx` — sale display with invoice number, customer tag for credit sales, and "View Receipt" button

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
