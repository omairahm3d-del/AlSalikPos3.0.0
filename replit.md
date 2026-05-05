# Overview

This project is a pnpm workspace monorepo utilizing TypeScript, designed to build a comprehensive Point of Sale (POS) system. The core offering is a mobile-first POS application developed with Expo and React Native, tailored for UAE market standards. The system aims to provide a full-featured POS solution comparable to Aronium Pro, including inventory management, customer relations, detailed reporting, and compliance with local tax regulations. Additionally, it includes a desktop application wrapper for Windows, enabling offline operation. The overall vision is to deliver a robust, scalable, and compliant POS platform for businesses in the UAE.

# User Preferences

I prefer iterative development with a focus on delivering functional components incrementally. Please ask for clarification if a task is ambiguous or before making significant architectural changes. I appreciate clear, concise communication and prefer explanations that focus on practical implications rather than overly theoretical concepts. When suggesting code, prioritize readability and maintainability.

# System Architecture

## Monorepo Structure

The project is structured as a pnpm workspace monorepo. Each package within the monorepo manages its own dependencies.

## Core Technologies

- **Node.js**: Version 24
- **Package Manager**: pnpm
- **TypeScript**: Version 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (v4) and `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild (for CJS bundles)

## POS App (`artifacts/pos-app`)

The POS application is built with Expo (SDK 54) and React Native, optimized for mobile-first use and tablet displays (10-inch).

### UI/UX and Design

- **Mobile-first Design**: Adapts for smaller screens with a single-panel layout and bottom cart bar.
- **Tablet Layout**: Utilizes a split-panel layout for screens ≥768px wide.
- **Dark UI Theme**: Background `#0F1117`, with specific color palettes for cards, primary actions, success, destructive actions, and warnings.
- **UAE Standards**: Currency (AED), VAT rate (5%), and specific tax invoice formats are integrated.
- **Receipts**: HTML-based templates for UAE Simplified Tax Invoices, bill previews, and kitchen tickets, with customization options. Invoice number printed as Code128 barcode on receipt. WhatsApp QR code linking to business phone number on receipt. Business logo support (base64-encoded, uploaded via Business Settings, rendered on receipt when "Show Logo" is enabled in Receipt Designer).

### Technical Implementations & Features

- **Offline Support**: Uses Expo-SQLite for native mobile, falling back to AsyncStorage for web, ensuring full offline functionality.
- **Performance Optimizations**: Extensive use of `React.memo`, `useCallback`, `useMemo`, and `FlatList` optimizations (`initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`, `getItemLayout`) for smooth UI performance, especially on the Register screen.
- **Data Management**: Robust CRUD operations for products, customers, staff, tables, ingredients, and sales.
- **Inventory Management**: Real-time stock tracking, low stock alerts, ingredient inventory with recipe-based deduction.
- **Order Management**: Support for Dine-in, Takeaway, Delivery order types, held orders for tables, and kitchen order tickets (KOT).
- **Payment Processing**: Multiple payment methods (Card, Cash, Credit, Split), integrated loyalty points system, and refund functionality.
- **Reporting**: Daily sales reports, Z-Reports (end-of-day summaries), and a comprehensive Reports Hub with 6 sub-reports: Z-Report History, Payment Method, Staff Sales, Rider Delivery, Customer Transactions, Daily Item Detail. Closing register prints Z-Report and optionally emails it — uses SMTP (API server / nodemailer) when configured, falls back to expo-mail-composer otherwise. Z-report closing modal shows expected cash (from cash sales) and live variance as the user types.
- **Staff Management**: PIN-based login with role (admin/cashier) authentication.
- **Barcode Scanning**: Integrated EAN-13/8, UPC-A/E, QR, Code128/39 scanning using `expo-camera`. Scanning a receipt barcode (INV-*) on Register screen looks up the credit sale and opens a credit payment collection modal.
- **WhatsApp QR**: Generated server-side via the `qrcode` npm package in `lib/barcodeSvg.ts` (`generateQRSVG` / `generateWhatsAppQRSVG`). Replaces a hand-rolled encoder that produced unscannable codes.
- **Cash Drawer**: Register screen has an "Open Drawer" button (`handleOpenCashDrawer`) that prints a tiny 80mm × 20mm "OPEN CASH DRAWER" page. The connected POS printer's driver should have "Open drawer on print" enabled (standard ESC/POS setup) — that triggers the kick.
- **Windows Direct Printing (Electron bridge)**: When the desktop installer runs, `desktop-installer/preload.js` exposes `window.electronPOS = { listPrinters(), silentPrint(html, opts) }` via contextBridge. `main.js` registers IPC handlers that wrap `webContents.getPrintersAsync()` and a hidden-window `webContents.print({silent:true, deviceName, pageSize:{width:80mm/58mm, height:297mm}, margins:none, printBackground:true})`. The pos-app helper `lib/printBridge.ts` (`isElectron`, `listWindowsPrinters`, `printHtml`) is used by every print site (ReceiptModal, CloseRegisterModal, CreditCollectionModal, reports.tsx, register/KOT/drawer in `app/(tabs)/index.tsx`). When a Windows printer name is configured in Printer Settings, prints go silent + full thermal width (no faint shrink-to-A4); otherwise it falls back to `window.print()` / `expo-print`. Printer Settings → "Windows Direct Printers" panel (only visible inside the .exe) lists installed printers with separate Receipt / KOT / Drawer assignments and a "Send Test Print" button. Field names on `PrinterSettings`: `windowsReceiptPrinterName`, `windowsKOTPrinterName`, `windowsDrawerPrinterName`.
- **Branding**: LockScreen (`components/LockScreen.tsx`) — full-screen LinearGradient backdrop with two soft glow blobs, top bar showing live time + date, business logo from `BusinessSettings.logoBase64` (falls back to gradient shopping-bag tile), business name pulled from settings, time-of-day greeting, animated pop on each PIN dot + horizontal shake on wrong PIN, footer "Al Salik POS · Powered by Al Salik Computers". Windows .exe has the icon + version metadata embedded via `resedit` (pure-JS PE editor) since wine isn't available in this environment. Icon source: `desktop-installer/assets/icon.ico` (multi-size from `artifacts/pos-app/assets/images/icon.png`).
- **Modals**: Centralized modal components for receipt preview, business settings, barcode scanning, and customer selection.

### POS App Tabs

1.  **Register**: Core POS interface with product grid, search, cart, payment, discounts, customer/table/staff selection, KOT, order types, and held orders.
2.  **Tables**: Management of POS tables, status tracking, and restoration of held orders.
3.  **History**: Sales transaction list, refunds, and receipt printing.
4.  **Back Office**: Centralized management hub containing:
    - **Products**: Product CRUD, stock tracking, tax group assignment, barcode assignment.
    - **Customers**: Customer management, credit balances, and loyalty points.
    - **Reports**: Daily sales reports and Z-Report functionalities.
    - **Categories**, **Delivery Riders**, **Ingredients**, **Recipes**, **Receipt Designer**, **Printer Settings**, **KOT Settings**, **Customer Display**, **Staff Management**, **Tax Groups**, **Business Settings**.
    - **Database**: Backup (download full JSON), Restore (upload JSON), and Clear Data with per-category checkboxes (sales, z-reports, held orders, customers, products, categories, ingredients, tax groups, riders, tables, reset invoice counter). Business settings, staff, printers, KOT, receipt design and email config are always preserved. Implemented via `exportData/importData/clearData` on `DatabaseContextValue` (web: AsyncStorage key dump; native: SQLite SELECT/INSERT inside `withTransactionAsync`). File I/O lives in `lib/backupFile.ts` (browser Blob download + `<input type=file>` on web/Electron, expo-file-system + expo-sharing/expo-document-picker on native).
    - **Email Settings**: Full SMTP configuration (host, port, SSL/TLS toggle, username, password, from name/email) with a "Send Test" button that calls `/api/email/test`. Also configures Z-Report recipient email. When SMTP is set, Z-Reports are auto-sent via nodemailer on the API server; otherwise falls back to device mail client.
    - **Reports Hub** (`components/ReportsHub.tsx`): 6 sub-reports — Z-Report History (expandable with cash variance), Payment Method breakdown with progress bars, Staff Sales ranking, Rider Delivery stats, Customer Transactions (searchable, drillable), Daily Item Detail (date navigator with per-sale item expansion).
    - **Permissions**: Granular staff permission controls (admin-only).

Products, Customers, and Reports are rendered as embedded sub-sections within Back Office using named exports with an `embedded` prop (controls padding). The route files remain in `app/(tabs)/` for Expo Router compatibility but are hidden from the tab bar via `href: null` (ClassicTabs) and trigger omission (NativeTabs).

## Desktop Installer (`desktop-installer/`)

A standalone Electron wrapper that bundles the Expo web export and ships as a Windows NSIS installer (`Al Salik POS Setup 1.0.0.exe`).

### Architecture

-   **Electron 33.x** wrapper (`main.js`): starts an internal `http.createServer` on a random localhost port that serves files from `www/` (the Expo web export), then loads it in a `BrowserWindow`. Avoids `file://` issues with Service Workers and absolute URLs.
-   **NSIS installer**: built directly with the cached `makensis` binary at `.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis` (electron-builder NSIS step is skipped because it requires Wine in this environment). Script: `desktop-installer/installer.nsi`. Output: `desktop-installer/dist/Al Salik POS Setup 1.0.0.exe`.
-   **Re-exporting the web bundle** (must be redone whenever pos-app code changes that should reach the Windows build):
    1. `cd artifacts/pos-app && pnpm exec expo export --platform web --output-dir ../../desktop-installer/www-new --clear`
    2. Replace `desktop-installer/www/` with `www-new/`
    3. Sync into the Electron staging dir: `cp -r desktop-installer/www desktop-installer/dist/win-unpacked/resources/app/www`
    4. Rebuild installer: `.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis desktop-installer/installer.nsi`
-   **Download endpoint**: `GET /api/download/info` returns metadata; `GET /api/download/installer` streams the `.exe` (see `artifacts/api-server/src/routes/download.ts`). The size in `info` is computed from the file on disk so it always reflects the latest rebuild.

### Web/Native print + email behavior (important for the desktop installer)

The desktop installer runs the Expo **web** export, so any code path gated to native (`Platform.OS !== "web"`) does not execute inside the Windows app. Rules:
- Printing on web (used for receipts, Z-Reports, credit-payment receipts): open a popup with the receipt HTML and call `window.print()`. Native uses `expo-print`.
- Sharing/PDF on web: just re-trigger print (no `expo-sharing` on web). `expo-sharing` is only imported inside `Platform.OS !== "web"` branches.
- Email Z-Report: try SMTP via `/api/email/send` first if SMTP is configured; if SMTP returns failure or is not configured, web falls back to `mailto:` (`window.open`); native falls back to `expo-mail-composer` with a generated PDF attachment.
- Files implementing this: `app/(tabs)/reports.tsx`, `components/ReceiptModal.tsx`, `components/CloseRegisterModal.tsx`, `components/CreditCollectionModal.tsx`.

# External Dependencies

-   **pnpm**: Monorepo management.
-   **TypeScript**: Language.
-   **Express**: API framework.
-   **PostgreSQL**: Database.
-   **Drizzle ORM**: Object-relational mapping.
-   **Zod**: Schema validation.
-   **Orval**: OpenAPI spec code generation.
-   **esbuild**: JavaScript bundler.
-   **Expo**: React Native framework.
-   **React Native**: UI framework.
-   **expo-sqlite**: SQLite database for native.
-   **AsyncStorage**: Web storage fallback.
-   **expo-print**: Printing functionality for native.
-   **expo-sharing**: PDF export functionality.
-   **expo-mail-composer**: Native email composition with attachments (Z-Report PDF).
-   **expo-camera**: Barcode scanning.
-   **Electron**: Desktop application framework.
-   **electron-builder**: Electron application packaging.