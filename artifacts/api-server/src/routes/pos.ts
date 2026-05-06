import { Router, type IRouter } from "express";
import { posPurchasingController } from "../controllers/posPurchasingController";
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

export default router;
