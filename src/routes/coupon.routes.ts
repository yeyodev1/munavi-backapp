import { Router } from "express";
import * as couponController from "../controllers/coupon.controller";

const router = Router();

router.post("/validate", couponController.validate);

export default router;
