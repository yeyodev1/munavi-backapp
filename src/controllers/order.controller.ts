import { Request, Response, NextFunction } from "express";
import * as orderService from "../services/order.service";

/** POST /api/orders/quote — body: { items, paymentMethod, couponCode? } */
export async function quote(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.quote(req.body));
  } catch (error) {
    next(error);
  }
}

/** POST /api/orders — body: { customer, shippingAddress, items, paymentMethod, couponCode? } */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await orderService.createOrder(req.body));
  } catch (error) {
    next(error);
  }
}

/** POST /api/orders/confirm — body: { id, clientTransactionId } */
export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.confirmPayment(req.body));
  } catch (error) {
    next(error);
  }
}

/** GET /api/orders/lookup?orderNumber&email */
export async function lookup(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.lookupOrder(req.query));
  } catch (error) {
    next(error);
  }
}

/** POST /api/orders/:orderNumber/retry — body: { email } */
export async function retry(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.retryPayment(String(req.params.orderNumber), req.body));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/orders?status&paymentMethod&q&page&limit */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.listOrders(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/orders/:id */
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.getOrder(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/orders/:id — body: { status?, trackingUrl?, adminNotes? } */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await orderService.updateOrder(String(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
}
