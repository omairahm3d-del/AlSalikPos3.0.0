import { Router, type IRouter } from "express";
import { licenseController } from "../controllers/licenseController";
import { asyncHandler } from "../utils/asyncHandler";
import { requireDevice } from "../middlewares/requireDevice";

const router: IRouter = Router();

router.post("/license/validate", asyncHandler(licenseController.validate));
router.get("/me", requireDevice, licenseController.me);

export default router;
