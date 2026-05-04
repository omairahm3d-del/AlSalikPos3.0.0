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
- **Receipts**: HTML-based templates for UAE Simplified Tax Invoices, bill previews, and kitchen tickets, with customization options. Invoice number printed as Code128 barcode on receipt. WhatsApp QR code linking to business phone number on receipt.

### Technical Implementations & Features

- **Offline Support**: Uses Expo-SQLite for native mobile, falling back to AsyncStorage for web, ensuring full offline functionality.
- **Performance Optimizations**: Extensive use of `React.memo`, `useCallback`, `useMemo`, and `FlatList` optimizations (`initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`, `getItemLayout`) for smooth UI performance, especially on the Register screen.
- **Data Management**: Robust CRUD operations for products, customers, staff, tables, ingredients, and sales.
- **Inventory Management**: Real-time stock tracking, low stock alerts, ingredient inventory with recipe-based deduction.
- **Order Management**: Support for Dine-in, Takeaway, Delivery order types, held orders for tables, and kitchen order tickets (KOT).
- **Payment Processing**: Multiple payment methods (Card, Cash, Credit, Split), integrated loyalty points system, and refund functionality.
- **Reporting**: Daily sales reports and Z-Reports (end-of-day summaries).
- **Staff Management**: PIN-based login with role (admin/cashier) authentication.
- **Barcode Scanning**: Integrated EAN-13/8, UPC-A/E, QR, Code128/39 scanning using `expo-camera`. Scanning a receipt barcode (INV-*) on Register screen looks up the credit sale and opens a credit payment collection modal.
- **Modals**: Centralized modal components for receipt preview, business settings, barcode scanning, and customer selection.

### POS App Tabs

1.  **Register**: Core POS interface with product grid, search, cart, payment, discounts, customer/table/staff selection, KOT, order types, and held orders.
2.  **Tables**: Management of POS tables, status tracking, and restoration of held orders.
3.  **History**: Sales transaction list, refunds, and receipt printing.
4.  **Customers**: Customer management, credit balances, and loyalty points.
5.  **Reports**: Daily sales reports and Z-Report functionalities.
6.  **Products**: Product CRUD, stock tracking, tax group assignment, barcode assignment.
7.  **Back Office**: Centralized settings for categories, delivery riders, ingredients, recipes, receipt design, printer, KOT, customer display, staff, tax groups, and business settings.

## Desktop App (`desktop-app/`)

A standalone Electron 22.x wrapper designed for Windows 8.1+ desktop deployment. It loads the static Expo web export from the `web-build/` directory, making it fully offline.

### Architecture

-   **Electron 22.3.27**: Utilized for its compatibility with Windows 8.1.
-   **electron-builder 24.13.3**: Used to create NSIS installers (.exe) for Windows x64 and ia32.
-   **Offline Operation**: Data stored in `localStorage` (via AsyncStorage web implementation). No server required.
-   **Asset Path Fixes**: Automatically adjusts absolute asset paths for `file://` protocol compatibility.

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
-   **expo-camera**: Barcode scanning.
-   **Electron**: Desktop application framework.
-   **electron-builder**: Electron application packaging.