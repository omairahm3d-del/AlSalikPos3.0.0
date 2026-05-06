import { Router, type IRouter } from "express";
import { managerController } from "../controllers/managerController";
import { requireManager } from "../middlewares/requireManager";
import { asyncHandler } from "../utils/asyncHandler";

const router: IRouter = Router();

router.post("/manager/login", asyncHandler(managerController.login));

router.use("/manager", requireManager);
router.get("/manager/me", asyncHandler(managerController.me));
router.get("/manager/branches", asyncHandler(managerController.listBranches));
router.get("/manager/sales", asyncHandler(managerController.listSales));
router.get(
  "/manager/sales/summary",
  asyncHandler(managerController.salesSummary),
);
router.get("/manager/products", asyncHandler(managerController.listProducts));
router.get(
  "/manager/categories",
  asyncHandler(managerController.listCategories),
);
router.get("/manager/customers", asyncHandler(managerController.listCustomers));

export default router;
