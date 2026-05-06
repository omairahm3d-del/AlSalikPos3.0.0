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
    -   `components/`: Reusable UI components.
    -   `lib/`: Utility functions and helper modules.
    -   `assets/images/icon.png`: Source for application icon.
-   `desktop-installer/`: Electron wrapper and NSIS installer configuration.
    -   `main.js`: Electron main process.
    -   `preload.js`: Electron preload script for context bridge.
    -   `installer.nsi`: NSIS installer script.
    -   `assets/icon.ico`: Desktop application icon.
-   **SaaS DB Schema**: `lib/saas-db/src/schema/` (one file per table, barrel re-export)
-   **Local POS Schema**: `artifacts/api-server/src/db/schema.ts`
-   **API Contracts**: `artifacts/api-server/src/routes/*.ts` (defined within Express routes)
-   **Theme/Styling**: Defined inline within React Native components and `components/Themed.tsx`.
-   **Receipt Templates**: HTML-based, generated dynamically (e.g., `components/ReceiptModal.tsx`, `components/CloseRegisterModal.tsx`).

## Architecture decisions

-   **Multi-tenant SaaS via license keys**: Every install must call `POST /api/license/validate` with `{licenseKey, deviceUid}` to receive a device JWT. No public signup; the owner issues licenses via admin endpoints (`x-admin-api-key` header). License has `maxDevices` enforced at validation; idempotent re-validation for the same `(licenseId, deviceUid)`.
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