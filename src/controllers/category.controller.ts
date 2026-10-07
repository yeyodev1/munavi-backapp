import { Request, Response, NextFunction } from "express";
import * as categoryService from "../services/category.service";

/** GET /api/admin/categories — todas, con productCount. */
export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.listCategories());
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/categories */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await categoryService.createCategory(req.body));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/categories/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await categoryService.updateCategory(String(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/categories/:id — 409 si tiene productos. */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await categoryService.deleteCategory(String(req.params.id));
    res.status(200).json({ message: "Categoría eliminada" });
  } catch (error) {
    next(error);
  }
}
