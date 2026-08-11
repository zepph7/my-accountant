/**
 * Row and DTO shapes shared across layers.
 *
 * Money fields are `string`, never `number` — they arrive from pg as decimal
 * strings by deliberate parser override (see config/db.ts) so that no amount
 * ever passes through a binary float. Use utils/money to compute on them.
 */

export type AuthProvider = 'local' | 'google';
export type UserRole = 'user' | 'admin';
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  password_hash: string | null;
  auth_provider: AuthProvider;
  google_id: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  role: UserRole;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

/** A user as returned to clients — never carries password_hash. */
export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: UserRole;
  timezone: string;
  isVerified: boolean;
  createdAt: Date;
}

export interface IncomeRow {
  id: string;
  user_id: string;
  source_id: string | null;
  date: string;
  amount: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DistributedIncomeRow {
  id: string;
  user_id: string;
  income_id: string;
  distribution_category_id: string;
  amount: string;
  percentage_applied: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ExpenseRow {
  id: string;
  user_id: string;
  category_id: string | null;
  occurred_at: Date;
  amount: string;
  description: string | null;
  payee: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}
