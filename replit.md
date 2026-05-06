# Al Salik POS

A mobile-first Point of Sale (POS) system for the UAE market, offering sales, inventory, and customer management with offline capabilities and tax compliance.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Run API Server**: `pnpm --filter=api-server dev`
-   **Run POS App**: `pnpm --filter=pos-app start`
-   **Build POS Web**: `cd artifacts/pos-app && pnpm exec expo export --platform web --output-dir ../../desktop-installer/www-new --clear`
-   **Build Desktop Installer**: `.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis desktop-installer/installer.nsi`
-   **Push SaaS Schema**: `pnpm --filter @workspace/saas-db run push`
-   **Run API tests**: `pnpm --filter @workspace/api-server run test` (Vitest + supertest, hits the real `SAAS_DATABASE_URL`; tests isolate by per-test company and clean up via cascade)
-   **Environment Variables**: `DATABASE_URL`, `SAAS_DATABASE_URL`, `SAAS_JWT_SECRET`, `SAAS_ADMIN_API_KEY`

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
-   **API Tests**: `artifacts/api-server/src/__tests__/` (license validate, sales push idempotency, catalog LWW + cursor, admin auth)
-   **Theme/Styling**: Inline within React Native components and `components/Themed.tsx`.
-   **Receipt Templates**: HTML-based, generated dynamically (e.g., `components/ReceiptModal.tsx`).

## Architecture decisions

-   **Multi-branch isolation**: Each company has one or more `saas_branches` rows. Products, categories, customers, sales, and devices carry a nullable `branch_id`. Sync push/pull is scoped to the device's branch (legacy NULL rows are visible too for back-compat). The backfill script (`scripts/src/backfillBranches.ts`) creates a default "Main" branch per company and stamps existing rows.
-   **Branch picker on activation**: License validate returns `{kind:"needs_branch_selection", branches:[…]}` when the company has >1 active branch and no `branchId` was provided; the POS client renders a picker and re-submits with the chosen `branchId`. The device row + JWT both pin `branchId`.
-   **Back Office reports parity**: The Back Office's Reports tab mirrors the POS app's `ReportsHub` (Daily Z-style roll-up, Payment Method, Staff, Rider, Customer Transactions, Daily Item Detail). All aggregates are computed client-side from `/api/manager/sales` (the cloud `salesTable.payload` is the full denormalized client `Sale` incl. items / staffName / riderName / orderType), so no extra server endpoints are required. Each view supports the same date presets as the POS and CSV-exports the visible rows. See `artifacts/back-office/src/pages/ReportsHub.tsx`.
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