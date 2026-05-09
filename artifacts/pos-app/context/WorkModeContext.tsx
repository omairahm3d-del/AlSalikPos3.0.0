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

export function WorkModeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useLicense();
  const workMode: WorkMode = (session?.workMode as WorkMode) ?? "standard";
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
