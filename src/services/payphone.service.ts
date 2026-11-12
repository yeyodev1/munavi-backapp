import axios from "axios";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { IOrder } from "../models/order.model";
import { getSettings } from "./settings.service";

const CONFIRM_URL = "https://paymentbox.payphonetodoesposible.com/api/confirm";

export const PAYPHONE_APPROVED = 3;
export const PAYPHONE_CANCELED = 2;

export interface PayphoneBox {
  token: string;
  storeId: string;
  clientTransactionId: string;
  amount: number;
  amountWithoutTax: number;
  amountWithTax: 0;
  tax: 0;
  currency: "USD";
  reference: string;
  email: string;
  phoneNumber: string;
  documentId: string;
}

/** Las del panel (Ajustes) mandan; si faltan, las del .env. */
async function credentials(): Promise<{ token: string; storeId: string }> {
  const { payphone } = await getSettings();
  return {
    token: payphone.token || env.PAYPHONE_TOKEN,
    storeId: payphone.storeId || env.PAYPHONE_STORE_ID,
  };
}

export async function isPayphoneConfigured(): Promise<boolean> {
  const { token, storeId } = await credentials();
  return !!(token && storeId);
}

export async function assertPayphoneConfigured(): Promise<{ token: string; storeId: string }> {
  const creds = await credentials();
  if (!creds.token || !creds.storeId) {
    throw new CustomError("El pago con tarjeta todavía no está disponible", 503);
  }
  return creds;
}

/** Único por intento y dentro del límite de 50 caracteres de Payphone. */
export function newClientTransactionId(orderNumber: string): string {
  return `${orderNumber}-${Date.now().toString(36)}`.slice(0, 50);
}

/**
 * Datos para la Cajita de Pagos. El token viaja al navegador porque así lo
 * exige la Cajita; el cobro igual se valida del lado del servidor al confirmar.
 */
export async function buildPayphoneBox(order: IOrder): Promise<PayphoneBox> {
  const { token, storeId } = await credentials();
  return {
    token,
    storeId,
    clientTransactionId: order.clientTransactionId,
    amount: order.total,
    // No se desglosa IVA: todo el monto va como "sin impuesto".
    amountWithoutTax: order.total,
    amountWithTax: 0,
    tax: 0,
    currency: "USD",
    reference: `Pedido ${order.orderNumber} Munavi`,
    email: order.customer.email,
    phoneNumber: `+593${order.customer.phone.replace(/^0/, "")}`,
    documentId: order.customer.documentId,
  };
}

export interface PayphoneConfirmResponse {
  statusCode?: number;
  transactionStatus?: string;
  transactionId?: number;
  authorizationCode?: string;
  amount?: number;
  clientTransactionId?: string;
  [key: string]: unknown;
}

export async function confirmTransaction(
  id: number,
  clientTxId: string,
): Promise<PayphoneConfirmResponse> {
  const { token } = await assertPayphoneConfigured();
  try {
    const { data } = await axios.post<PayphoneConfirmResponse>(
      CONFIRM_URL,
      { id, clientTxId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      },
    );
    return data;
  } catch (error: any) {
    // Solo se registra el estado y el cuerpo de Payphone: la petición lleva el token.
    console.error(
      "[payphone] confirmación fallida:",
      error?.response?.status,
      error?.response?.data,
    );
    throw new CustomError(
      "No pudimos confirmar el pago con Payphone. Intenta de nuevo en un momento.",
      502,
    );
  }
}
