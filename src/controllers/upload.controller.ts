import { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/customError.error";
import { uploadBuffer } from "../services/cloudinary.service";

const PRODUCTS_FOLDER = "munavi/products";

/** POST /api/admin/uploads — multipart con el campo "file". */
export async function uploadImage(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) throw new CustomError("Adjunta una imagen", 400);
    if (!file.mimetype.startsWith("image/"))
      throw new CustomError("El archivo debe ser una imagen", 400);
    res.status(201).json(await uploadBuffer(file.buffer, PRODUCTS_FOLDER));
  } catch (error) {
    next(error);
  }
}
