import { useWorkMode } from "@/context/WorkModeContext";
import { LaundryRegister } from "./_register/LaundryRegister";
import { RetailRegister } from "./_register/RetailRegister";
import { SaloonRegister } from "./_register/SaloonRegister";
import { StandardRegister } from "./_register/StandardRegister";

/**
 * POSScreen — thin mode router.
 * Each work mode renders its own fully-isolated register with no
 * cross-mode code paths, preventing regressions when one mode changes.
 */
export default function POSScreen() {
  const { isLaundry, isSaloon, isRetail } = useWorkMode();
  if (isLaundry) return <LaundryRegister />;
  if (isSaloon) return <SaloonRegister />;
  if (isRetail) return <RetailRegister />;
  return <StandardRegister />;
}
