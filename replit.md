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

Mobile-first Point of Sale app built with Expo (SDK 54) and React Native.

### Features
- **Offline SQLite database** (expo-sqlite ~16.0.10) on native; AsyncStorage fallback on web
- **Product catalog** — 18 seed products across 4 categories (Beverages, Food, Snacks, Desserts)
- **Barcode scanner** — uses expo-camera ~17.0.10; scans EAN-13/8, UPC-A/E, QR, Code128/39
  - Register screen: scan to instantly add product to cart
  - Products screen: assign mode to link a barcode to any product
- **Shopping cart** with 20% VAT calculation, subtotal, grand total
- **Sales history** with per-day grouping and stats
- **Daily sales report** — date-navigable report with revenue, transactions, avg order, VAT, hourly sales chart, top-selling products, revenue by category, payment method breakdown
- **Dark UI theme** (`#0F1117` background) — designed for 10-inch tablets
- **Split-panel layout** on screens ≥768px wide; single-panel + bottom cart bar on mobile

### Tabs
1. **Register** (`index.tsx`) — POS grid + cart + barcode scan
2. **History** (`history.tsx`) — transaction list with today's stats
3. **Reports** (`reports.tsx`) — daily sales report with date navigation
4. **Products** (`products.tsx`) — CRUD product management + barcode assignment

### Key Files
- `types/index.ts` — Product (includes optional `barcode`), CartItem, Sale, SaleItem interfaces
- `lib/database.ts` — SQLite init + barcode column migration
- `context/DatabaseCore.ts` — shared context + `useDatabase()` hook (includes `loadSalesWithItemsByDateRange`)
- `context/DatabaseContext.tsx` — SQLite (native) provider: `NativeDatabaseProvider`
- `context/WebDatabaseProvider.tsx` — AsyncStorage (web) provider
- `context/DatabaseProvider.native.tsx` / `.web.tsx` — platform dispatch
- `context/CartContext.tsx` — cart reducer with VAT
- `components/BarcodeScannerModal.tsx` — full-screen camera scanner with viewfinder UI

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
