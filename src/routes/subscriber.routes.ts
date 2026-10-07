import { Router } from "express";
import * as subscriberController from "../controllers/subscriber.controller";

const router = Router();

router.post("/", subscriberController.subscribe);

export default router;
