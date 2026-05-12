import { Router, type IRouter } from "express";
import { posPurchasingController } from "../controllers/posPurchasingController";
import { posKdsController } from "../controllers/posKdsController";
import { posLaundryController } from "../controllers/posLaundryController";
import { posStaffRiderController } from "../controllers/posStaffRiderController";
import { requireDevice } from "../middlewares/requireDevice";
import { requireWorkMode } from "../middlewares/requireWorkMode";
import { asyncHandler } from "../utils/asyncHandler";

const router: IRouter = Router();

router.use("/pos", requireDevice);

// ── Purchasing & stock (all modes with stock tracking) ─────────────────────
router.get("/pos/suppliers", asyncHandler(posPurchasingController.listSuppliers));
router.post("/pos/suppliers", asyncHandler(posPurchasingController.createSupplier));
router.patch("/pos/suppliers/:id", asyncHandler(posPurchasingController.updateSupplier));

router.get("/pos/purchases", asyncHandler(posPurchasingController.listPurchases));
router.post("/pos/purchases", asyncHandler(posPurchasingController.createPurchase));
router.get("/pos/purchases/:id", asyncHandler(posPurchasingController.getPurchase));

router.get("/pos/stock", asyncHandler(posPurchasingController.listOnHand));
router.get("/pos/stock/movements", asyncHandler(posPurchasingController.listMovements));
router.post("/pos/stock/adjustments", asyncHandler(posPurchasingController.createAdjustment));

// ── Held orders / KDS — standard (restaurant) mode only ───────────────────
router.get(
  "/pos/held-orders",
  requireWorkMode("standard"),
  asyncHandler(posKdsController.listHeldOrders),
);
router.post(
  "/pos/held-orders",
  requireWorkMode("standard"),
  asyncHandler(posKdsController.upsertHeldOrder),
);
router.patch(
  "/pos/held-orders/:clientId/kds-status",
  requireWorkMode("standard"),
  asyncHandler(posKdsController.updateKdsStatus),
);

// ── Laundry orders — laundry mode only ────────────────────────────────────
router.get(
  "/pos/laundry/orders",
  requireWorkMode("laundry"),
  asyncHandler(posLaundryController.listOrders),
);
router.post(
  "/pos/laundry/orders",
  requireWorkMode("laundry"),
  asyncHandler(posLaundryController.upsertOrder),
);
router.patch(
  "/pos/laundry/orders/:clientId/status",
  requireWorkMode("laundry"),
  asyncHandler(posLaundryController.updateStatus),
);

// ── Staff & riders (all modes) ─────────────────────────────────────────────
router.get("/pos/staff", asyncHandler(posStaffRiderController.listStaff));
router.post("/pos/staff", asyncHandler(posStaffRiderController.upsertStaff));

router.get("/pos/riders", asyncHandler(posStaffRiderController.listRiders));
router.post("/pos/riders", asyncHandler(posStaffRiderController.upsertRider));

export default router;
