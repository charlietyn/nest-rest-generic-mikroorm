export type OrderDirection = 'asc' | 'desc' | 'ASC' | 'DESC';
export type OrderByEntry = Record<string, OrderDirection>;
export type LogicalOperator = 'and' | 'or';

export interface OperNode {
  and?: OperCondition[];
  or?: OperCondition[];
  [relation: string]: OperCondition[] | OperNode | string | undefined;
}
export type OperCondition = string | OperNode;

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  pagesize?: number;
  infinity?: boolean;
  cursor?: string | number | null;
}

export type HierarchyFilterMode =
  | 'match_only'
  | 'with_ancestors'
  | 'with_descendants'
  | 'full_branch'
  | 'root_filter';

export interface HierarchyConfig {
  enabled?: boolean;
  children_key?: string;
  max_depth?: number | null;
  filter_mode?: HierarchyFilterMode;
  include_empty_children?: boolean;
}

export interface FilterParams {
  relations?: string | string[] | null;
  _nested?: boolean;
  soft_delete?: boolean | null;
  attr?: Record<string, unknown> | string | null;
  eq?: Record<string, unknown> | string | null;
  select?: string | string[];
  pagination?: PaginationParams | string | null;
  orderby?: OrderByEntry[] | string | null;
  oper?: OperNode | OperCondition[] | string | null;
  hierarchy?: boolean | HierarchyConfig | string | null;
  cache?: boolean;
  cache_ttl?: number;
  columns?: string | string[];
  filename?: string;
  template?: string;
  [key: string]: unknown;
}
