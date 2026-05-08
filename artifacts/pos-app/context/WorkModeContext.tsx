import React, { createContext, useContext, useMemo } from "react";
import { useLicense } from "./LicenseContext";

export type WorkMode = "standard" | "saloon";

interface WorkModeContextValue {
  workMode: WorkMode;
  isSaloon: boolean;
  /** "Products" in standard, "Services" in saloon */
  productLabel: string;
  /** "Product" in standard, "Service" in saloon */
  productLabelSingular: string;
  /** "Tables" in standard, "Chairs" in saloon */
  tableLabel: string;
  /** "Table" in standard, "Chair" in saloon */
  tableLabelSingular: string;
  /** "Dine-in" in standard, "Station" in saloon */
  dineInLabel: string;
  /** "KOT" in standard, "SOT" in saloon */
  orderTicketLabel: string;
}

const WorkModeContext = createContext<WorkModeContextValue | null>(null);

export function WorkModeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useLicense();
  const workMode: WorkMode = session?.workMode ?? "standard";
  const isSaloon = workMode === "saloon";

  const value = useMemo<WorkModeContextValue>(
    () => ({
      workMode,
      isSaloon,
      productLabel: isSaloon ? "Services" : "Products",
      productLabelSingular: isSaloon ? "Service" : "Product",
      tableLabel: isSaloon ? "Chairs" : "Tables",
      tableLabelSingular: isSaloon ? "Chair" : "Table",
      dineInLabel: isSaloon ? "Station" : "Dine-in",
      orderTicketLabel: isSaloon ? "SOT" : "KOT",
    }),
    [workMode, isSaloon],
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
