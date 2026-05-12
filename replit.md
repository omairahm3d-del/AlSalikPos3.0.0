# Al Salik POS

A mobile-first Point of Sale (POS) system for the UAE market, offering sales, inventory, and customer management with offline capabilities and tax compliance.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Run API Server**: `pnpm --filter=api-server dev`
-   **Run POS App**: `pnpm --filter=pos-app start`
-   **Build POS Web**: `cd artifacts/pos-app && pnpm exec expo export --platform web --output-dir ../../desktop-installer/www-new --clear`
-   **Build Desktop Installer**: `.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis desktop-installer/installer.nsi`
-   **Push SaaS Schema**: `pnpm --filter @workspace/saas-db run push`
-   **Backfill branches** (one-shot, idempotent): `pnpm --filter @workspace/scripts run backfill:branches` — creates a default "Main" branch per company and stamps legacy NULL `branch_id` rows on all tables.
-   **Run API tests**: `pnpm --filter @workspace/api-server run test` (Vitest + supertest, hits the real `SAAS_DATABASE_URL`; tests isolate by per-test company and clean up via cascade)
-   **Environment Variables**: `DATABASE_URL`, `SAAS_DATABASE_URL`, `SAAS_JWT_SECRET`, `SAAS_ADMIN_API_KEY`

## Android APK Local Builds (v3.0.0, no cloud)

Run from `artifacts/pos-app/`. Add `--local` so EAS runs the build pipeline on **your laptop** instead of the EAS cloud. All 4 APKs have distinct app names, package IDs, and icons and can be sideloaded simultaneously on the same device.

**Prerequisites (laptop):** Android SDK, Java 17+, EAS CLI (`npm i -g eas-cli`), logged in (`eas login`).

| Mode | Local build command | App name | Android package | Icon |
|------|--------------------|-----------|-----------------|----|
| Restaurant | `eas build --local --platform android --profile standard` | Al Salik Restaurant | `com.alsalikcomputers.pos` | Fork & knife |
| Saloon | `eas build --local --platform android --profile saloon` | Al Salik Saloon | `com.alsalikcomputers.pos.saloon` | Golden scissors |
| Laundry | `eas build --local --platform android --profile laundry` | Al Salik Laundry | `com.alsalikcomputers.pos.laundry` | Washing machine |
| Retail | `eas build --local --platform android --profile retail` | Al Salik Retail | `com.alsalikcomputers.pos.retail` | Shopping bag |
| Multi-mode preview | `eas build --local --platform android --profile preview` | Al Salik Restaurant | `com.alsalikcomputers.pos` | — |

Each command produces a `.apk` file in `artifacts/pos-app/build/` on the laptop.

## Windows Installer Local Build (v3.0.0)

The Windows installer always wraps the **Restaurant** (standard) mode via the Electron shell.

**Steps (run from `desktop-installer/`):**

```bash
# 1. Export Expo web (from repo root)
pnpm --filter @workspace/desktop-installer run export-web

# 2. Swap in the new web bundle and rebuild Electron unpacked dir
pnpm --filter @workspace/desktop-installer run rebuild-web

# 3. Build the Electron app (win x64, no signing)
pnpm --filter @workspace/desktop-installer run build:win

# 4. Package the NSIS installer  →  dist/Al Salik Restaurant Setup 3.0.0.exe
pnpm --filter @workspace/desktop-installer run build:installer
```

For 32-bit / Windows 7: swap steps 3–4 with `build:win7-32` + `build:installer-32`.

The `EXPO_PUBLIC_WORK_MODE` env var is baked in at build time by `eas.json`. `app.config.js` reads it to set the app name, icon, and package ID dynamically. The POS register screen for each mode lives in `app/(tabs)/_register/<Mode>Register.tsx` — completely isolated, no cross-mode branches.

## Stack

-   **Runtime**: Node.js 24
-   **Package Manager**: pnpm
-   **Language**: TypeScript 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Validation**: Zod (v4), `drizzle-zod`
-   **API Codegen**: Orval
-   **Build Tool**: esbuild
-   **Frontend**: Expo SDK 54, React Native
-   **Desktop**: Electron 33.x

## Where things live

-   `artifacts/admin/`: SaaS admin console (React + Vite).
-   `artifacts/api-server/`: Backend API (Express).
-   `artifacts/back-office/`: Manager-facing back office web app (React + Vite). Reports, products, customers — scoped to a chosen branch.
-   `lib/saas-db/`: Multi-tenant Postgres schema.
-   `artifacts/pos-app/`: Mobile and web POS application (Expo/React Native).
-   `desktop-installer/`: Electron wrapper and NSIS installer configuration.
-   **SaaS DB Schema**: `lib/saas-db/src/schema/`
-   **Local POS Schema**: `artifacts/api-server/src/db/schema.ts`
-   **API Contracts**: `artifacts/api-server/src/routes/*.ts`
-   **API Tests**: `artifacts/api-server/src/__tests__/` (license validate, sales push idempotency, catalog LWW + cursor, admin auth, purchasing & stock manager-auth and device-auth)
-   **Theme/Styling**: Inline within React Native components and `components/Themed.tsx`.
-   **Receipt Templates**: HTML-based, generated dynamically (e.g., `components/ReceiptModal.tsx`).

## Architecture decisions

-   **Multi-branch isolation**: Each company has one or more `saas_branches` rows. Products, categories, customers, sales, and devices carry a nullable `branch_id`. Sync push/pull is scoped to the device's branch (legacy NULL rows are visible too for back-compat). The backfill script (`scripts/src/backfillBranches.ts`) creates a default "Main" branch per company and stamps existing rows.
-   **Branch picker on activation**: License validate returns `{kind:"needs_branch_selection", branches:[…]}` when the company has >1 active branch and no `branchId` was provided; the POS client renders a picker and re-submits with the chosen `branchId`. The device row + JWT both pin `branchId`.
-   **Work Mode (standard vs saloon)**: Each company has a `work_mode` column (`standard` | `saloon`, default `standard`). Set per-company from the admin console's Company Detail page. The POS app exposes a `WorkModeContext` (wrapping the full app in `_layout.tsx`) that provides `isSaloon`, `productLabel`, and `serviceLabel`. In saloon mode: the Products tab shows a "Duration (minutes)" field per service; adding a product opens a stylist-picker modal; `CartItem` and `SaleItem` carry `stylistId/stylistName`; local SQLite and AsyncStorage (web) persist these new columns. The Back Office's Reports tab shows a "Stylist Report" card in saloon mode, aggregating revenue and service count per stylist from sale item payloads. The license/validate response and manager login response both return `workMode` so the POS client and back-office session are always in sync with the server. API: `PATCH /api/admin/companies/:companyId` updates `workMode`.
-   **Supplier statements**: `GET /api/manager/suppliers/:id/statement?branchId&from&to` returns the supplier row + all matching purchases + aggregate totals (`count`, `subtotal`, `vatAmount`, `total`, `missingReferenceCount`). Branch-private suppliers are pinned to their own branch; company-wide suppliers can be queried per-branch or across all branches. The Back Office's Suppliers tab opens a modal with date pickers, a totals card, a missing-reference warning, and a CSV export button.
-   **Purchasing & stock (single source of truth)**: Stock-on-hand is computed from a unified `stock_movements` table — every purchase line, sale line, and manual adjustment writes one row with `delta` (+/-), `kind` (`purchase`/`sale`/`adjustment`), and `refId`. Idempotency is enforced by `UNIQUE(companyId, kind, refId, productClientId)` so re-pushed sales and re-saved purchases never double-count. Goods Received entries (`saas_purchases` + `saas_purchase_items`) capture supplier, VAT per line, and totals; the header insert + line inserts + stock movements are wrapped in a single transaction. The Back Office exposes Suppliers, Purchases (Receive Stock), and Stock (on-hand + history + manual adjust) tabs under `/api/manager/{suppliers,purchases,stock,stock/movements,stock/adjustments}`. Suppliers may be branch-private (`branchId` set) or company-wide (`branchId = NULL`); reads from a branch see both.
-   **POS-side purchasing & stock**: Device-auth mirror of the manager endpoints lives at `/api/pos/{suppliers,purchases,stock,stock/movements,stock/adjustments}` (`controllers/posPurchasingController.ts` + `routes/pos.ts`, mounted via `requireDevice`). `companyId` and `branchId` come from the device JWT — body `branchId` is force-overridden, and `getPurchase` defends against cross-branch URL guessing. The POS app exposes three Back Office cards (Stock, Purchases, Receive Stock) that route via expo-router to dedicated screens (`app/{stock,purchases,receive-stock}.tsx`); the Receive Stock form generates a per-form-open `idempotencyKey` so double-taps never create duplicate GRNs. Client helpers in `lib/posPurchasing.ts`.
-   **Back-office manager auth**: Managers log in with `companySlug + email + password` against `/api/manager/login` (passwords hashed with Node `scrypt`). The returned JWT (`kind:"manager"`) authorizes `/api/manager/*` read endpoints, all of which take `?branchId=` and reject branches that don't belong to the manager's company. `requireManager` re-checks `isActive` and the `passwordHash` snapshot embedded in the token (`pwh` claim) on every protected request, so admin deactivations and password resets revoke all live sessions immediately rather than waiting up to 12h for token expiry. Managers are CRUD'd from the admin app's Managers tab (or `/api/admin/companies/:id/managers`). The Back Office itself is a separate React+Vite artifact (Expo was originally requested but blocked by the one-mobile-app-per-project constraint).
-   **Multi-tenant SaaS via license keys**: Activation requires `POST /api/license/validate` with `licenseKey` and `deviceUid` to obtain a device JWT. Licenses are issued via admin endpoints.
-   **License types**: `online` licenses keep the cloud sync engine running; `offline` licenses activate online once, persist `expiresAt` locally, then run with sync hard-disabled (enforced in `SyncContext` and `LicenseContext.refresh`). Local expiry is checked on mount so the device re-activates without contacting the server.
-   **License gate above all providers**: The POS client's local database only opens after successful license validation; session restored from AsyncStorage.
-   **Append-only sales sync**: Sales are pushed to the server in batches, with idempotency enforced by `UNIQUE(company_id, client_sale_id)`.
-   **Client outbound sync queue**: A local `sync_queue` table tracks pending pushes, processed in batches with exponential backoff.
-   **Bidirectional catalog sync (LWW)**: Products, categories, and customers sync both ways using last-write-wins based on `updatedAt` timestamps. Deletes are soft.
-   **Two databases on purpose**: `lib/db` (legacy single-tenant) and `lib/saas-db` (cloud multi-tenant) are distinct and do not share tables.
-   **Layered API**: Clear separation of concerns with routes, controllers, services, and repositories.
-   **Offline-First POS**: Utilizes Expo-SQLite (native) and AsyncStorage (web) for full offline functionality.
-   **Platform-Specific Printing**: Distinct printing mechanisms for web, native, and Windows desktop.
-   **HTML-based Receipts**: Dynamic HTML templates for rich, customizable receipts compliant with UAE tax regulations.
-   **Embedded Desktop Web Export**: Electron app serves Expo web export internally to avoid `file://` limitations.

## Product

-   **Mobile-First POS**: Optimized for mobile and tablet, with adaptive UI.
-   **Comprehensive Inventory**: Real-time stock, low stock alerts, ingredient management.
-   **Flexible Order Management**: Dine-in, Takeaway, Delivery, held orders, KOT.
-   **Multi-Payment Options**: Card, Cash, Credit, Split payments, loyalty, refunds.
-   **Detailed Reporting**: Daily sales, Z-Reports, Reports Hub with CSV export.
-   **UAE Compliance**: AED currency, 5% VAT, specific tax invoice formats.
-   **Staff & Customer Management**: PIN-based staff login with roles, customer CRM.
-   **Barcode Integration**: EAN-13/8, UPC-A/E, QR, Code128/39 scanning.
-   **Desktop Application**: Windows wrapper with direct printing, cash drawer, on-screen keyboard.

## User preferences

I prefer iterative development with a focus on delivering functional components incrementally. Please ask for clarification if a task is ambiguous or before making significant architectural changes. I appreciate clear, concise communication and prefer explanations that focus on practical implications rather than overly theoretical concepts. When suggesting code, prioritize readability and maintainability.

**Server / activation URL**: Always use `https://retail-hub-omairahm3d.replit.app` as the API base for the desktop installer (`desktop-installer/api-config.json`). Do NOT switch it to `https://alsalik.com` or any other domain unless explicitly asked.

## Gotchas

-   **Desktop Installer Rebuild**: Requires manual rebuild of web export and NSIS installer for `artifacts/pos-app` changes.
-   **Printing on Windows**: POS printers need "Open drawer on print" enabled; printer names must exactly match configured Windows names.
-   **Email Fallbacks**: Z-Report email logic varies by platform and SMTP config.
-   **Electron Context Bridge**: Direct `window.electronPOS` manipulation is limited to `desktop-installer/preload.js` for security.

## Pointers

-   **React Native Performance**: [https://reactnative.dev/docs/performance](https://reactnative.dev/docs/performance)
-   **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
-   **Drizzle ORM Docs**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
-   **Zod Schema Definition**: [https://zod.dev/](https://zod.dev/)
-   **Electron Documentation**: [https://www.electronjs.org/docs/latest](https://www.electronjs.org/docs/latest)
-   **pnpm Workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)