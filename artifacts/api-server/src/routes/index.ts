import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workspaceRouter from "./workspace";
import commandsRouter from "./commands";
import eventCommerceRouter from "./event-commerce";
import roomAttendanceRouter from "./room-attendance";
import crmRouter from "./crm";
import livekitRouter from "./livekit";
import diagnosticsRouter from "./diagnostics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workspaceRouter);
router.use(commandsRouter);
router.use(eventCommerceRouter);
router.use(roomAttendanceRouter);
router.use(crmRouter);
router.use(livekitRouter);
router.use(diagnosticsRouter);

export default router;
