import { Router, type IRouter } from "express";
import { syncController } from "../controllers/syncController";
import { catalogController } from "../controllers/catalogController";
import { asyncHandler } from "../utils/asyncHandler";
import { requireDevice } from "../middlewares/requireDevice";

const router: IRouter = Router();

router.post("/sync/sales", requireDevice, asyncHandler(syncController.pushSales));
router.post(
  "/sync/catalog/push",
  requireDevice,
  asyncHandler(catalogController.push),
);
router.get(
  "/sync/catalog/pull",
  requireDevice,
  asyncHandler(catalogController.pull),
);

export default router;
