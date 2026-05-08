import { Router, type IRouter } from "express";
import { adminController } from "../controllers/adminController";
import { branchController } from "../controllers/branchController";
import { requireAdmin } from "../middlewares/requireAdmin";
import { asyncHandler } from "../utils/asyncHandler";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

router.post("/admin/companies", asyncHandler(adminController.createCompany));
router.get("/admin/companies", asyncHandler(adminController.listCompanies));
router.patch("/admin/companies/:companyId", asyncHandler(adminController.updateCompany));
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
router.patch(
  "/admin/companies/:companyId/licenses/:licenseId/extend",
  asyncHandler(adminController.extendLicense),
);
router.patch(
  "/admin/companies/:companyId/licenses/:licenseId/devices",
  asyncHandler(adminController.setDeviceLimit),
);
router.delete(
  "/admin/companies/:companyId/licenses/:licenseId",
  asyncHandler(adminController.deleteLicense),
);
router.delete(
  "/admin/companies/:companyId/devices/:deviceId",
  asyncHandler(adminController.removeDevice),
);

router.get(
  "/admin/companies/:companyId/branches",
  asyncHandler(branchController.list),
);
router.post(
  "/admin/companies/:companyId/branches",
  asyncHandler(branchController.create),
);
router.patch(
  "/admin/companies/:companyId/branches/:branchId",
  asyncHandler(branchController.update),
);

router.get(
  "/admin/companies/:companyId/managers",
  asyncHandler(adminController.listManagers),
);
router.post(
  "/admin/companies/:companyId/managers",
  asyncHandler(adminController.createManager),
);
router.patch(
  "/admin/companies/:companyId/managers/:managerId/active",
  asyncHandler(adminController.setManagerActive),
);
router.post(
  "/admin/companies/:companyId/managers/:managerId/password",
  asyncHandler(adminController.resetManagerPassword),
);

export default router;
