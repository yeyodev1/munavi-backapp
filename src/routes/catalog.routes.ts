import { Router } from "express";
import * as catalogController from "../controllers/catalog.controller";

const router = Router();

router.get("/categories", catalogController.listCategories);
router.get("/products", catalogController.listProducts);
router.get("/products/:slug", catalogController.getProduct);

export default router;
