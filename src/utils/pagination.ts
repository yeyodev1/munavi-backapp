export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: any, defaultLimit = 20, maxLimit = 100): Pagination {
  const page = Math.max(1, Math.floor(Number(query?.page)) || 1);
  const rawLimit = Math.floor(Number(query?.limit)) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated<T>(items: T[], total: number, { page, limit }: Pagination) {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escapa texto del usuario antes de meterlo en un RegExp de Mongo. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
