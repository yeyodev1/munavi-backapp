import express, { Application } from "express";
import authRoutes from "./auth.routes";
import healthRoutes from "./health.routes";
import catalogRoutes from "./catalog.routes";
import settingsRoutes from "./settings.routes";
import subscriberRoutes from "./subscriber.routes";
import couponRoutes from "./coupon.routes";
import orderRoutes from "./order.routes";
import adminRoutes from "./admin.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/catalog", catalogRoutes);
  router.use("/settings", settingsRoutes);
  router.use("/subscribers", subscriberRoutes);
  router.use("/coupons", couponRoutes);
  router.use("/orders", orderRoutes);
  router.use("/admin", adminRoutes);
}

export default routerApi;
