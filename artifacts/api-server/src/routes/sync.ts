import { Router, type IRouter } from "express";
import { syncController } from "../controllers/syncController";
import { asyncHandler } from "../utils/asyncHandler";
import { requireDevice } from "../middlewares/requireDevice";

const router: IRouter = Router();

router.post("/sync/sales", requireDevice, asyncHandler(syncController.pushSales));

export default router;
