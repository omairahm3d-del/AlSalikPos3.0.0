# Al Salik POS

A mobile-first Point of Sale (POS) system for the UAE market, offering comprehensive sales, inventory, and customer management, with offline capabilities and local tax compliance.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Run API Server**: `pnpm --filter=api-server dev`
-   **Run POS App**: `pnpm --filter=pos-app start`
-   **Build POS Web**: `cd artifacts/pos-app && pnpm exec expo export --platform web --output-dir ../../desktop-installer/www-new --clear`
-   **Build Desktop Installer**: `.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis desktop-installer/installer.nsi`
-   **Database Migrations**: _Populate as you build_
-   **Push SaaS Schema**: `pnpm --filter @workspace/saas-db run push`
-   **Environment Variables**:
    -   `DATABASE_URL`: Replit Postgres (legacy single-tenant; not used by SaaS layer)
    -   `SAAS_DATABASE_URL`: Separate cloud Postgres for the multi-tenant SaaS backend
    -   `SAAS_JWT_SECRET`: Signs device JWTs returned by `/api/license/validate`
    -   `SAAS_ADMIN_API_KEY`: Required as `x-admin-api-key` header for `/api/admin/*` routes

## Stack

-   **Runtime**: Node.js 24
-   **Package Manager**: pnpm
-   **Language**: TypeScript 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Validation**: Zod (v4), `drizzle-zod`
-   **API Codegen**: Orval (from OpenAPI spec)
-   **Build Tool**: esbuild (for CJS bundles)
-   **Frontend**: Expo SDK 54, React Native
-   **Desktop**: Electron 33.x

## Where things live

-   `artifacts/api-server/`: Backend API. Layered: `routes/` → `controllers/` → `services/` → `repositories/`. Cross-cutting in `middlewares/`, `lib/`, `utils/`.
-   `lib/saas-db/`: Multi-tenant Postgres schema for the cloud SaaS backend (companies, licenses, devices). Uses `SAAS_DATABASE_URL` — separate from Replit's `DATABASE_URL`.
-   `artifacts/pos-app/`: Mobile and web POS application (Expo/React Native).
    -   `app/(tabs)/`: Main application tabs and screens.
    -   `app/_layout.tsx`: Provider tree. `LicenseProvider` + `LicenseGate` wrap everything; nothing else mounts until the device has a valid SaaS JWT.
    -   `components/`: Reusable UI components (incl. `ActivationScreen.tsx`, `LockScreen.tsx`).
    -   `context/LicenseContext.tsx`: Holds `{session, activate, deactivate, refresh}`; ops are sequenced via `opSeq` to ignore stale results.
    -   `context/SyncContext.tsx`: Drives sales push + catalog push/pull on one timer; tenant-guarded.
    -   `lib/saasApi.ts`: `getApiBase()`, `validateLicense()`, `authedFetch()` — single place that talks to the SaaS backend.
    -   `lib/syncEngine.ts`: Sales push engine (Phase 3b).
    -   `lib/catalogSyncEngine.ts`: Catalog push+pull engine (Phase 3c).
    -   `lib/saasStorage.ts`: AsyncStorage-backed session + single-flight `getOrCreateDeviceUid()` + catalog pull cursor.
    -   `assets/images/icon.png`: Source for application icon.
-   `desktop-installer/`: Electron wrapper and NSIS installer configuration.
    -   `main.js`: Electron main process.
    -   `preload.js`: Electron preload script for context bridge.
    -   `installer.nsi`: NSIS installer script.
    -   `assets/icon.ico`: Desktop application icon.
-   **SaaS DB Schema**: `lib/saas-db/src/schema/` (one file per table, barrel re-export). Catalog tables: `saas_products`, `saas_categories`.
-   **Local POS Schema**: `artifacts/api-server/src/db/schema.ts`
-   **Catalog server layer**: `artifacts/api-server/src/{repositories,services,controllers}/catalog*.ts`
-   **API Contracts**: `artifacts/api-server/src/routes/*.ts` (defined within Express routes)
-   **Theme/Styling**: Defined inline within React Native components and `components/Themed.tsx`.
-   **Receipt Templates**: HTML-based, generated dynamically (e.g., `components/ReceiptModal.tsx`, `components/CloseRegisterModal.tsx`).

## Architecture decisions

-   **Multi-tenant SaaS via license keys**: Every install must call `POST /api/license/validate` with `{licenseKey, deviceUid}` to receive a device JWT. No public signup; the owner issues licenses via admin endpoints (`x-admin-api-key` header). License has `maxDevices` enforced at validation; idempotent re-validation for the same `(licenseId, deviceUid)`.
-   **License gate above all providers**: The Expo client mounts `LicenseProvider`/`LicenseGate` outside `DatabaseProvider`, so the local DB never opens for an unactivated install. Session is restored from AsyncStorage on launch, refreshed once in the background, and only dropped on hard server states (`license_revoked`, `license_expired`, `license_not_found`, `company_suspended`) — network errors keep the POS working offline until the JWT itself expires. `deviceUid` is preserved across `deactivate()` so re-activation reuses the same license slot.
-   **API base resolution (Expo)**: `EXPO_PUBLIC_API_BASE` (build-time override, used by the desktop installer) → native fallback `https://EXPO_PUBLIC_DOMAIN` → web fallback `""` (relative; same-origin proxy on Replit).
-   **Append-only sales sync**: Devices `POST /api/sync/sales` with a batch (≤200) of sales. Idempotency is DB-enforced via `UNIQUE(company_id, client_sale_id)` + `INSERT ... ON CONFLICT DO NOTHING RETURNING`, so retries are safe. The full client `Sale` (incl. items, splits) is preserved in `payload` jsonb; only the columns reporting needs (total, vatAmount, paymentMethod, isRefund, staffId, customerId, timestamps) are extracted. `companyId`/`deviceId` come from the JWT — never from the body — so a device can't push for another tenant. Money is `numeric(14,4)`; the API rejects NaN/Infinity, >4-decimal amounts, and timestamps outside `[2020-01-01, now+24h]`.
-   **Client outbound sync queue**: A local `sync_queue` table (SQLite native / JSON on web) tracks pending pushes. Native enqueues happen *inside* the same `saveSale`/`processRefund` transaction so a sale is never committed without a queue row. `SyncContext` mounts inside `DatabaseProvider`+`LicenseGate`, drains in batches of 50 with exponential backoff (5s × 2^attempts, capped at 5 min), and treats server-confirmed `duplicate` as success (the row is in the cloud either way). 401 from the API does not bump attempt counts — instead it triggers `LicenseContext.refresh()` which either re-mints a JWT or drops the session. `reconcilePendingSync()` on engine startup backfills queue rows for any pre-existing sale (handles legacy installs and backup restores).
-   **Bidirectional catalog sync (LWW)**: Products and categories sync both ways via `POST /api/sync/catalog/push` + `GET /api/sync/catalog/pull?since=&limit=`. Local edits go through a separate `catalog_outbox` table (native) / `@pos_catalog_outbox` JSON (web) that **upserts per (entity_type, entity_id)** — rapid edits collapse into one pending snapshot instead of piling up, and `attempt_count` resets on each fresh edit. Each entity carries `updatedAt` (wall-clock ms) and the server uses it for last-write-wins via `ON CONFLICT DO UPDATE WHERE clientUpdatedAt < incoming`. Deletes are soft (`deletedAt` tombstone) and propagate as payload `{id}` with `deleted: true`. Pull is cursor-paginated independently per stream using a `(serverUpdatedAt, clientId)` tuple — public cursor format `"<pISO>~<pId>|<cISO>~<cId>"` (opaque to the client, URL-encoded; backwards-compatible with bare ISO and legacy `pISO|cISO`). Per-stream cursors prevent cross-stream skip; the tuple inside each stream prevents skipping rows that share a millisecond timestamp at a page boundary. The cursor lives in AsyncStorage at `saas.catalogCursor` and is cleared by `clearOwningCompanyId()` so a license swap or backup restore starts fresh. `applyRemoteCatalog()` first checks the outbox (so a pending **unpushed local delete or edit** is never clobbered by a stale pull, even when the local entity row is gone), then falls back to comparing the entity table's `updatedAt`. Native runs the whole pass in `withExclusiveTransactionAsync`; web serializes catalog mutations through a single-writer in-process mutex (`runCatalogExclusive`) to prevent read-modify-write races on the JSON blobs. Apply uses INSERT OR REPLACE / full-replace semantics on both platforms — the incoming payload is authoritative, no field-level merge. The catalog tick runs in the same `SyncContext` loop as sales (sales first, then catalog) and shares the tenant guard; sales 401 short-circuits before catalog, surfacing `pendingCatalogCount` alongside `pendingCount`.
-   **Catalog stock is full LWW (v1)**: Pushed product payloads include `stockQuantity`, so two devices changing inventory between syncs will resolve via wall-clock LWW rather than additively. Acceptable for v1 because the local POS is the source of truth for sales-driven stock changes and the typical pattern is one POS per till; if multi-device inventory editing becomes common, switch to an event/ledger sync (deltas) instead of full-entity LWW.
-   **Two databases on purpose**: `lib/db` (Replit DATABASE_URL) is the legacy single-tenant DB and is left untouched. `lib/saas-db` (SAAS_DATABASE_URL) is the cloud multi-tenant DB. They never share a connection or table.
-   **Layered API**: Routes only wire URLs; controllers only parse/respond; services hold business rules; repositories own all Drizzle queries. Centralized `errorHandler` translates `HttpError` and `ZodError` into JSON.
-   **Monorepo for Cohesion**: Utilizes pnpm workspaces to manage shared dependencies and facilitate development across API, POS app, and desktop installer.
-   **Offline-First POS**: Employs Expo-SQLite (native) and AsyncStorage (web) to ensure full application functionality without an internet connection, critical for POS operations.
-   **Platform-Specific Printing**: Implements distinct printing mechanisms for web (`window.print()`), native (`expo-print`), and Windows desktop (Electron bridge with `silentPrint`), to accommodate varied environments while centralizing print logic.
-   **HTML-based Receipts**: Uses HTML templates for receipts and KOTs to allow for rich formatting, branding (logos, QR codes), and easy customization compliant with UAE tax regulations.
-   **Embedded Desktop Web Export**: The Electron desktop application serves the Expo web export from an internal HTTP server, avoiding `file://` limitations with Service Workers and ensuring consistent behavior with the web version.

## Product

-   **Mobile-First POS**: Optimized for mobile and tablet, adapting UI layouts based on screen size (single-panel for mobile, split-panel for tablets).
-   **Comprehensive Inventory**: Real-time stock tracking, low stock alerts, ingredient management, and recipe-based deduction.
-   **Flexible Order Management**: Supports Dine-in, Takeaway, Delivery, held orders, and kitchen order tickets (KOT).
-   **Multi-Payment Options**: Card, Cash, Credit, Split payments, loyalty points, and refund capabilities.
-   **Detailed Reporting**: Daily sales, Z-Reports (end-of-day), and a Reports Hub with 6 sub-reports, all with CSV export.
-   **UAE Compliance**: Integrated AED currency, 5% VAT, and specific tax invoice formats.
-   **Staff & Customer Management**: PIN-based staff login with roles, customer CRM with credit and loyalty.
-   **Barcode Integration**: EAN-13/8, UPC-A/E, QR, Code128/39 scanning for products and receipt lookups.
-   **Desktop Application**: Windows wrapper with direct printing, cash drawer control, and integrated on-screen keyboard.

## User preferences

I prefer iterative development with a focus on delivering functional components incrementally. Please ask for clarification if a task is ambiguous or before making significant architectural changes. I appreciate clear, concise communication and prefer explanations that focus on practical implications rather than overly theoretical concepts. When suggesting code, prioritize readability and maintainability.

## Gotchas

-   **Desktop Installer Rebuild**: Any changes to `artifacts/pos-app` that need to be reflected in the Windows installer require manually rebuilding the web export and the NSIS installer.
-   **Printing on Windows**: Ensure POS printers have "Open drawer on print" enabled in their drivers for cash drawer kick to function. Also, printer names configured in settings must exactly match installed Windows printer names for direct printing.
-   **Email Fallbacks**: Understand the logic for Z-Report email (SMTP via API server -> `expo-mail-composer` -> `mailto:`) as it varies by platform and SMTP configuration.
-   **Electron Context Bridge**: Direct manipulation of `window.electronPOS` is limited to the `desktop-installer/preload.js` context for security.

## Pointers

-   **React Native Performance**: [https://reactnative.dev/docs/performance](https://reactnative.dev/docs/performance)
-   **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
-   **Drizzle ORM Docs**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
-   **Zod Schema Definition**: [https://zod.dev/](https://zod.dev/)
-   **Electron Documentation**: [https://www.electronjs.org/docs/latest](https://www.electronjs.org/docs/latest)
-   **pnpm Workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)