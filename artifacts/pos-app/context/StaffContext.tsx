import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useDatabase } from "./DatabaseCore";
import type { Staff } from "@/types";

interface StaffContextValue {
  currentStaff: Staff | null;
  staffRequired: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  refreshStaffCheck: () => Promise<void>;
}

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { authenticateStaff, loadStaff } = useDatabase();
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [staffRequired, setStaffRequired] = useState(false);
  const [checked, setChecked] = useState(false);

  const refreshStaffCheck = useCallback(async () => {
    const staff = await loadStaff();
    setStaffRequired(staff.length > 0);
    if (staff.length === 0) setCurrentStaff(null);
    setChecked(true);
  }, [loadStaff]);

  useEffect(() => {
    refreshStaffCheck();
  }, [refreshStaffCheck]);

  const login = useCallback(async (pin: string): Promise<boolean> => {
    const staff = await authenticateStaff(pin);
    if (staff) {
      setCurrentStaff(staff);
      return true;
    }
    return false;
  }, [authenticateStaff]);

  const logout = useCallback(() => {
    setCurrentStaff(null);
  }, []);

  if (!checked) return null;

  return (
    <StaffContext.Provider value={{ currentStaff, staffRequired, login, logout, refreshStaffCheck }}>
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff must be used within StaffProvider");
  return ctx;
}
