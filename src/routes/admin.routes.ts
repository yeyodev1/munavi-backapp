import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import * as statsController from "../controllers/stats.controller";
import * as categoryController from "../controllers/category.controller";
import * as productController from "../controllers/product.controller";
import * as uploadController from "../controllers/upload.controller";
import * as orderController from "../controllers/order.controller";
import * as settingsController from "../controllers/settings.controller";
import * as couponController from "../controllers/coupon.controller";
import * as subscriberController from "../controllers/subscriber.controller";

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", statsController.get);

router.get("/categories", categoryController.list);
router.post("/categories", categoryController.create);
router.put("/categories/:id", categoryController.update);
router.delete("/categories/:id", categoryController.remove);

router.get("/products", productController.list);
router.get("/products/:id", productController.get);
router.post("/products", productController.create);
router.put("/products/:id", productController.update);
router.delete("/products/:id", productController.remove);

router.post("/uploads", uploadMiddleware.single("file"), uploadController.uploadImage);

router.get("/orders", orderController.list);
router.get("/orders/:id", orderController.get);
router.patch("/orders/:id", orderController.update);

router.get("/settings", settingsController.get);
router.put("/settings", settingsController.update);

router.get("/coupons", couponController.list);
router.post("/coupons", couponController.create);
router.put("/coupons/:id", couponController.update);
router.delete("/coupons/:id", couponController.remove);

router.get("/subscribers", subscriberController.list);
router.delete("/subscribers/:id", subscriberController.remove);

export default router;
