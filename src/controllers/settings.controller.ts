import { Request, Response, NextFunction } from "express";
import * as settingsService from "../services/settings.service";

/** GET /api/settings/public */
export async function getPublic(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await settingsService.getPublicSettings());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/settings */
export async function get(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await settingsService.getSettings());
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/settings — reemplaza solo los campos enviados. */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await settingsService.updateSettings(req.body));
  } catch (error) {
    next(error);
  }
}
