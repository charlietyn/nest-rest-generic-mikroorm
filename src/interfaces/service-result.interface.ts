export interface DataResult<T = unknown> {
  data: T;
}

export interface PaginatedResult<T = unknown> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface CursorPaginatedResult<T = unknown> {
  data: T[];
  per_page: number;
  next_cursor: string | number | null;
  has_more: boolean;
}

export interface WriteItemResult<T = unknown> {
  success: boolean;
  model?: T;
  message?: string;
  errors?: unknown;
}

export interface WriteResult<T = unknown> {
  success: boolean;
  model?: T;
  models?: WriteItemResult<T>[];
  message?: string;
  errors?: unknown;
}
