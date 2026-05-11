import { Router, type IRouter } from "express";
import { posPurchasingController } from "../controllers/posPurchasingController";
import { posKdsController } from "../controllers/posKdsController";
import { posLaundryController } from "../controllers/posLaundryController";
import { posStaffRiderController } from "../controllers/posStaffRiderController";
import { requireDevice } from "../middlewares/requireDevice";
import { asyncHandler } from "../utils/asyncHandler";

const router: IRouter = Router();

router.use("/pos", requireDevice);

router.get("/pos/suppliers", asyncHandler(posPurchasingController.listSuppliers));
router.post("/pos/suppliers", asyncHandler(posPurchasingController.createSupplier));
router.patch("/pos/suppliers/:id", asyncHandler(posPurchasingController.updateSupplier));

router.get("/pos/purchases", asyncHandler(posPurchasingController.listPurchases));
router.post("/pos/purchases", asyncHandler(posPurchasingController.createPurchase));
router.get("/pos/purchases/:id", asyncHandler(posPurchasingController.getPurchase));

router.get("/pos/stock", asyncHandler(posPurchasingController.listOnHand));
router.get(
  "/pos/stock/movements",
  asyncHandler(posPurchasingController.listMovements),
);
router.post(
  "/pos/stock/adjustments",
  asyncHandler(posPurchasingController.createAdjustment),
);

router.get("/pos/held-orders", asyncHandler(posKdsController.listHeldOrders));
router.post("/pos/held-orders", asyncHandler(posKdsController.upsertHeldOrder));
router.patch("/pos/held-orders/:clientId/kds-status", asyncHandler(posKdsController.updateKdsStatus));

router.get("/pos/laundry/orders", asyncHandler(posLaundryController.listOrders));
router.post("/pos/laundry/orders", asyncHandler(posLaundryController.upsertOrder));
router.patch("/pos/laundry/orders/:clientId/status", asyncHandler(posLaundryController.updateStatus));

router.get("/pos/staff", asyncHandler(posStaffRiderController.listStaff));
router.post("/pos/staff", asyncHandler(posStaffRiderController.upsertStaff));

router.get("/pos/riders", asyncHandler(posStaffRiderController.listRiders));
router.post("/pos/riders", asyncHandler(posStaffRiderController.upsertRider));

export default router;
