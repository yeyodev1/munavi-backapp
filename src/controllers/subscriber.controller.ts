import { Request, Response, NextFunction } from "express";
import * as subscriberService from "../services/subscriber.service";

/** POST /api/subscribers — body: { email, source } */
export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await subscriberService.subscribe(req.body));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/subscribers — paginado, o CSV con ?format=csv */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.query.format === "csv") {
      const csv = await subscriberService.subscribersCsv(req.query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="suscriptores-munavi.csv"');
      // BOM: Excel abre el CSV con tildes bien.
      res.status(200).send(`﻿${csv}`);
      return;
    }
    res.status(200).json(await subscriberService.listSubscribers(req.query));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/subscribers/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await subscriberService.deleteSubscriber(String(req.params.id));
    res.status(200).json({ message: "Suscriptor eliminado" });
  } catch (error) {
    next(error);
  }
}
