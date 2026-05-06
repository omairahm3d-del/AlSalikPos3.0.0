import { Router, type IRouter } from "express";
import { adminController } from "../controllers/adminController";
import { requireAdmin } from "../middlewares/requireAdmin";
import { asyncHandler } from "../utils/asyncHandler";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

router.post("/admin/companies", asyncHandler(adminController.createCompany));
router.get("/admin/companies", asyncHandler(adminController.listCompanies));
router.post("/admin/licenses", asyncHandler(adminController.issueLicense));
router.get(
  "/admin/companies/:companyId/licenses",
  asyncHandler(adminController.listCompanyLicenses),
);
router.get(
  "/admin/companies/:companyId/devices",
  asyncHandler(adminController.listCompanyDevices),
);
router.post(
  "/admin/companies/:companyId/licenses/:licenseId/revoke",
  asyncHandler(adminController.revokeLicense),
);

export default router;
