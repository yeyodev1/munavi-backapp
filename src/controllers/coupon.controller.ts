import { Request, Response, NextFunction } from "express";
import * as couponService from "../services/coupon.service";

/** POST /api/coupons/validate — body: { code } */
export async function validate(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await couponService.validateCoupon(req.body?.code));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/coupons */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await couponService.listCoupons(req.query));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/coupons */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await couponService.createCoupon(req.body));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/coupons/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await couponService.updateCoupon(String(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/coupons/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await couponService.deleteCoupon(String(req.params.id));
    res.status(200).json({ message: "Cupón eliminado" });
  } catch (error) {
    next(error);
  }
}
