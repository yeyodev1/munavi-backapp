import { Types } from "mongoose";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email);
}

export function isObjectId(id: unknown): id is string {
  return typeof id === "string" && Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id);
}

/**
 * Normaliza un teléfono ecuatoriano a 10 dígitos (09XXXXXXXX).
 * Acepta +593 / 593 delante y espacios o guiones. Devuelve null si no es válido.
 */
export function normalizeEcuadorPhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("593")) digits = digits.slice(3);
  if (digits.length === 9) digits = `0${digits}`;
  return /^0\d{9}$/.test(digits) ? digits : null;
}

/** Cédula (10 dígitos) o RUC (13 dígitos). */
export function normalizeDocumentId(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

export function toCents(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
