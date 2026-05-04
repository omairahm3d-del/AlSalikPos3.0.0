import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import downloadRouter from "./download";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailRouter);
router.use(downloadRouter);

export default router;
