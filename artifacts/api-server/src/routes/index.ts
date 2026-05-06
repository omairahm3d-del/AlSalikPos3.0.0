import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import downloadRouter from "./download";
import licenseRouter from "./license";
import adminRouter from "./admin";
import syncRouter from "./sync";
import managerRouter from "./manager";
import posRouter from "./pos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailRouter);
router.use(downloadRouter);
router.use(licenseRouter);
router.use(adminRouter);
router.use(syncRouter);
router.use(managerRouter);
router.use(posRouter);

export default router;
