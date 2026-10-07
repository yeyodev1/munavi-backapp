import { Request, Response, NextFunction } from "express";
import * as productService from "../services/product.service";

/** GET /api/admin/products?q&category&page&limit — incluye no publicados. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.listProducts(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/products/:id */
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.getProduct(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/products */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await productService.createProduct(req.body));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/products/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.updateProduct(String(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/products/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await productService.deleteProduct(String(req.params.id));
    res.status(200).json({ message: "Producto eliminado" });
  } catch (error) {
    next(error);
  }
}
