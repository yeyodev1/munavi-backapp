import { Request, Response, NextFunction } from "express";
import * as catalogService from "../services/catalog.service";

/** GET /api/catalog/categories */
export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.listActiveCategories());
  } catch (error) {
    next(error);
  }
}

/** GET /api/catalog/products?category&featured&bestSeller&q&page&limit */
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.listPublishedProducts(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/catalog/products/:slug */
export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.getPublishedProduct(String(req.params.slug)));
  } catch (error) {
    next(error);
  }
}
