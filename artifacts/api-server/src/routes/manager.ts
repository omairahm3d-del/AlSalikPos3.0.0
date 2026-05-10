import { Router, type IRouter } from "express";
import { managerController } from "../controllers/managerController";
import { purchasingController } from "../controllers/purchasingController";
import { packagesController } from "../controllers/packagesController";
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
router.post(
  "/manager/catalog/import",
  asyncHandler(managerController.importCatalog),
);
router.get(
  "/manager/categories",
  asyncHandler(managerController.listCategories),
);
router.get("/manager/customers", asyncHandler(managerController.listCustomers));
router.post(
  "/manager/sales/:clientSaleId/refund",
  asyncHandler(managerController.createRefund),
);

// Purchasing & stock
router.get(
  "/manager/suppliers",
  asyncHandler(purchasingController.listSuppliers),
);
router.get(
  "/manager/suppliers/activity",
  asyncHandler(purchasingController.getSuppliersActivity),
);
router.post(
  "/manager/suppliers",
  asyncHandler(purchasingController.createSupplier),
);
router.patch(
  "/manager/suppliers/:id",
  asyncHandler(purchasingController.updateSupplier),
);
router.get(
  "/manager/suppliers/:id/statement",
  asyncHandler(purchasingController.getSupplierStatement),
);
router.get(
  "/manager/purchases",
  asyncHandler(purchasingController.listPurchases),
);
router.post(
  "/manager/purchases",
  asyncHandler(purchasingController.createPurchase),
);
router.get(
  "/manager/purchases/:id",
  asyncHandler(purchasingController.getPurchase),
);
router.get("/manager/stock", asyncHandler(purchasingController.listOnHand));
router.get(
  "/manager/stock/movements",
  asyncHandler(purchasingController.listMovements),
);
router.post(
  "/manager/stock/adjustments",
  asyncHandler(purchasingController.createAdjustment),
);

// Prepaid packages (saloon mode)
router.get("/manager/packages", asyncHandler(packagesController.listPackages));
router.post(
  "/manager/packages",
  asyncHandler(packagesController.createPackage),
);
router.patch(
  "/manager/packages/:id",
  asyncHandler(packagesController.updatePackage),
);
router.delete(
  "/manager/packages/:id",
  asyncHandler(packagesController.deletePackage),
);
router.get(
  "/manager/customer-packages",
  asyncHandler(packagesController.listCustomerPackages),
);

export default router;
