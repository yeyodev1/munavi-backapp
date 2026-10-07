import { Router } from "express";
import * as orderController from "../controllers/order.controller";

const router = Router();

router.post("/quote", orderController.quote);
router.post("/confirm", orderController.confirm);
router.get("/lookup", orderController.lookup);
router.post("/:orderNumber/retry", orderController.retry);
router.post("/", orderController.create);

export default router;
