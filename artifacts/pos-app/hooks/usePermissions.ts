import { useCallback, useEffect, useState } from "react";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { ADMIN_PERMISSIONS, DEFAULT_CASHIER_PERMISSIONS } from "@/types";
import type { StaffPermissions } from "@/types";

export function usePermissions(): StaffPermissions {
  const { currentStaff, staffRequired } = useStaff();
  const { loadBusinessSettings } = useDatabase();

  const [permissions, setPermissions] = useState<StaffPermissions>(() => {
    if (!staffRequired || !currentStaff || currentStaff.role === "admin") {
      return ADMIN_PERMISSIONS;
    }
    return DEFAULT_CASHIER_PERMISSIONS;
  });

  const resolve = useCallback(async () => {
    if (!staffRequired || !currentStaff || currentStaff.role === "admin") {
      setPermissions(ADMIN_PERMISSIONS);
      return;
    }
    const biz = await loadBusinessSettings();
    const saved = biz.rolePermissions?.cashier;
    setPermissions(saved ? { ...DEFAULT_CASHIER_PERMISSIONS, ...saved } : DEFAULT_CASHIER_PERMISSIONS);
  }, [currentStaff, staffRequired, loadBusinessSettings]);

  useEffect(() => { resolve(); }, [resolve]);

  return permissions;
}
