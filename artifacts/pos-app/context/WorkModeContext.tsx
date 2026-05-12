import React, { createContext, useContext, useMemo } from "react";
import { useLicense } from "./LicenseContext";

export type WorkMode = "standard" | "saloon" | "laundry" | "retail";

interface WorkModeContextValue {
  workMode: WorkMode;
  isSaloon: boolean;
  isLaundry: boolean;
  isRetail: boolean;
  /** "Products" in standard/retail, "Services" in saloon/laundry */
  productLabel: string;
  /** "Product" in standard/retail, "Service" in saloon/laundry */
  productLabelSingular: string;
  /** "Tables" in standard, "Chairs" in saloon (hidden in laundry/retail) */
  tableLabel: string;
  /** "Table" in standard, "Chair" in saloon (hidden in laundry/retail) */
  tableLabelSingular: string;
  /** "Dine-in" in standard, "Station" in saloon, "Drop-off" in laundry, "Sale" in retail */
  dineInLabel: string;
  /** "KOT" in standard, "SOT" in saloon (hidden in laundry/retail) */
  orderTicketLabel: string;
}

const WorkModeContext = createContext<WorkModeContextValue | null>(null);

/**
 * Build-time mode lock: when EXPO_PUBLIC_WORK_MODE is set in eas.json,
 * the APK is permanently locked to that mode regardless of what the server
 * returns in the license JWT. This prevents cross-mode regressions — e.g.
 * a laundry APK will never accidentally render saloon UI.
 *
 * Falls back to session.workMode (server-returned) for the multi-mode
 * "preview" build and desktop installer where no lock is configured.
 */
const BUILD_TIME_MODE = process.env.EXPO_PUBLIC_WORK_MODE as WorkMode | undefined;

export function WorkModeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useLicense();
  const workMode: WorkMode =
    BUILD_TIME_MODE ?? (session?.workMode as WorkMode) ?? "standard";
  const isSaloon = workMode === "saloon";
  const isLaundry = workMode === "laundry";
  const isRetail = workMode === "retail";

  const value = useMemo<WorkModeContextValue>(
    () => ({
      workMode,
      isSaloon,
      isLaundry,
      isRetail,
      productLabel: isSaloon ? "Services" : isLaundry ? "Services" : "Products",
      productLabelSingular: isSaloon ? "Service" : isLaundry ? "Service" : "Product",
      tableLabel: isSaloon ? "Chairs" : "Tables",
      tableLabelSingular: isSaloon ? "Chair" : "Table",
      dineInLabel: isSaloon ? "Station" : isLaundry ? "Drop-off" : "Dine-in",
      orderTicketLabel: isSaloon ? "SOT" : "KOT",
    }),
    [workMode, isSaloon, isLaundry, isRetail],
  );

  return (
    <WorkModeContext.Provider value={value}>
      {children}
    </WorkModeContext.Provider>
  );
}

export function useWorkMode(): WorkModeContextValue {
  const ctx = useContext(WorkModeContext);
  if (!ctx) throw new Error("useWorkMode must be used within WorkModeProvider");
  return ctx;
}
