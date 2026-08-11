import { request, type Page } from './api';

/**
 * Every resource the API exposes, typed.
 *
 * Row shapes are snake_case because that is what the database returns and the
 * API passes through unchanged; computed report fields are camelCase because
 * the service layer builds them. Both are reproduced faithfully rather than
 * normalised — a translation layer here would be one more place for the client
 * and the server to disagree about a field name.
 *
 * Money is a string everywhere, never a number. `NUMERIC(14,2)` round-trips
 * exactly through a string and does not through a JavaScript float, and a
 * rounding error in a finance app is not a cosmetic bug.
 */

export type Wallet = 'cash' | 'account' | 'mpesa';

export const WALLETS: readonly Wallet[] = ['cash', 'account', 'mpesa'];

export const WALLET_LABELS: Record<Wallet, string> = {
  cash: 'Cash',
  account: 'Bank account',
  mpesa: 'M-Pesa',
};

/* ------------------------------------------------------------------ incomes */

export interface Income {
  id: string;
  user_id: string;
  source_id: string | null;
  source_name: string | null;
  date: string;
  amount: string;
  notes: string | null;
  wallet: Wallet;
  created_at: string;
  updated_at: string;
}

export interface IncomeSplit {
  id: string;
  distribution_category_id: string;
  category_name: string;
  amount: string;
  percentage_applied: string;
}

export interface IncomeDetail extends Income {
  distribution: IncomeSplit[];
  /** Present when the configured percentages do not total 100. */
  warning?: string;
}

export interface IncomeInput {
  sourceId?: string | null;
  date: string;
  amount: string;
  notes?: string | null;
  wallet?: Wallet;
}

/**
 * Declared as a type alias, not an interface, so it satisfies the transport's
 * `Record<string, ...>` query parameter — TypeScript gives object type aliases
 * an implicit index signature and interfaces none.
 */
export type IncomeFilters = {
  page?: number;
  limit?: number;
  sort?: 'date' | 'amount' | 'created_at';
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
  sourceId?: string;
  wallet?: Wallet;
};

export const listIncomes = (filters: IncomeFilters = {}) =>
  request<Page<Income>>('/api/incomes', { query: filters });

export const getIncome = (id: string) => request<IncomeDetail>(`/api/incomes/${id}`);

export const createIncome = (body: IncomeInput) =>
  request<IncomeDetail>('/api/incomes', { method: 'POST', body });

export const updateIncome = (id: string, body: Partial<IncomeInput>) =>
  request<IncomeDetail>(`/api/incomes/${id}`, { method: 'PATCH', body });

export const deleteIncome = (id: string) =>
  request<void>(`/api/incomes/${id}`, { method: 'DELETE' });

/* ----------------------------------------------------------- income sources */

export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listIncomeSources = (search?: string) =>
  request<Page<IncomeSource>>('/api/income-sources', {
    query: { limit: 100, sort: 'name', order: 'asc', search },
  });

export const createIncomeSource = (name: string) =>
  request<IncomeSource>('/api/income-sources', { method: 'POST', body: { name } });

export const updateIncomeSource = (id: string, name: string) =>
  request<IncomeSource>(`/api/income-sources/${id}`, { method: 'PATCH', body: { name } });

export const deleteIncomeSource = (id: string) =>
  request<void>(`/api/income-sources/${id}`, { method: 'DELETE' });

/* ----------------------------------------------------------------- expenses */

export interface Expense {
  id: string;
  user_id: string;
  category_id: string | null;
  category_name: string | null;
  occurred_at: string;
  amount: string;
  description: string | null;
  payee: string | null;
  wallet: Wallet;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  categoryId?: string | null;
  occurredAt: string;
  amount: string;
  description?: string | null;
  payee?: string | null;
  wallet?: Wallet;
}

/** A type alias for the same reason as {@link IncomeFilters}. */
export type ExpenseFilters = {
  page?: number;
  limit?: number;
  sort?: 'occurred_at' | 'amount' | 'created_at';
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
  categoryId?: string;
  wallet?: Wallet;
  search?: string;
};

export const listExpenses = (filters: ExpenseFilters = {}) =>
  request<Page<Expense>>('/api/expenses', { query: filters });

export const getExpense = (id: string) => request<Expense>(`/api/expenses/${id}`);

export const createExpense = (body: ExpenseInput) =>
  request<Expense>('/api/expenses', { method: 'POST', body });

export const updateExpense = (id: string, body: Partial<ExpenseInput>) =>
  request<Expense>(`/api/expenses/${id}`, { method: 'PATCH', body });

export const deleteExpense = (id: string) =>
  request<void>(`/api/expenses/${id}`, { method: 'DELETE' });

/* -------------------------------------------------------- expense categories */

export interface ExpenseCategory {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listExpenseCategories = (search?: string) =>
  request<Page<ExpenseCategory>>('/api/expense-categories', {
    query: { limit: 100, sort: 'name', order: 'asc', search },
  });

export const createExpenseCategory = (name: string) =>
  request<ExpenseCategory>('/api/expense-categories', { method: 'POST', body: { name } });

export const updateExpenseCategory = (id: string, name: string) =>
  request<ExpenseCategory>(`/api/expense-categories/${id}`, { method: 'PATCH', body: { name } });

export const deleteExpenseCategory = (id: string) =>
  request<void>(`/api/expense-categories/${id}`, { method: 'DELETE' });

/* --------------------------------------------------- distribution categories */

export interface DistributionCategory {
  id: string;
  user_id: string;
  name: string;
  percentage: string;
  created_at: string;
  updated_at: string;
}

/** The list ships the percentage total so a settings screen can warn without a second request. */
export interface DistributionPage extends Page<DistributionCategory> {
  totalPercentage?: number;
}

export const listDistributionCategories = () =>
  request<DistributionPage>('/api/distribution-categories', {
    query: { limit: 100, sort: 'percentage', order: 'desc' },
  });

export const createDistributionCategory = (body: { name: string; percentage: string }) =>
  request<DistributionCategory>('/api/distribution-categories', { method: 'POST', body });

export const updateDistributionCategory = (
  id: string,
  body: { name?: string; percentage?: string }
) => request<DistributionCategory>(`/api/distribution-categories/${id}`, { method: 'PATCH', body });

export const deleteDistributionCategory = (id: string) =>
  request<void>(`/api/distribution-categories/${id}`, { method: 'DELETE' });

/* ----------------------------------------------------------------- overview */

export interface Overview {
  id: string;
  user_id: string;
  cash_wallet: string;
  account_balance: string;
  mpesa_balance: string;
  created_at: string;
}

export const listOverviews = (page = 1) =>
  request<Page<Overview>>('/api/overview', { query: { page, limit: 20 } });

export const getCurrentOverview = () => request<Overview | null>('/api/overview/current');

export const createOverview = (body: {
  cashWallet: string;
  accountBalance: string;
  mpesaBalance: string;
}) => request<Overview>('/api/overview', { method: 'POST', body });

/* ------------------------------------------------------------------ reports */

export interface Range {
  from: string;
  to: string;
  timezone: string;
}

export interface WalletBalance {
  opening: string;
  movement: string;
  balance: string;
}

export interface Dashboard {
  balances: {
    asOf: string | null;
    cash: WalletBalance;
    account: WalletBalance;
    mpesa: WalletBalance;
    total: string;
  };
  currentMonth: {
    range: Range;
    income: string;
    expenses: string;
    net: string;
    distributed: {
      categoryId: string;
      name: string;
      percentage: string;
      total: string;
    }[];
  };
  distributionSetup: { totalPercentage: number; warning: string | null };
  recent: { incomes: Income[]; expenses: Expense[] };
}

export const getDashboard = () => request<Dashboard>('/api/dashboard');

export interface Summary {
  range: Range;
  income: { total: string; count: number };
  expenses: { total: string; count: number };
  net: string;
  savingsRate: number;
  distributed: {
    total: string;
    byCategory: {
      categoryId: string;
      name: string;
      percentage: string;
      total: string;
      count: number;
      shareOfDistributed: number;
    }[];
  };
  expensesByCategory: {
    categoryId: string | null;
    name: string;
    total: string;
    count: number;
    shareOfExpenses: number;
  }[];
}

export const getSummary = (range: { from?: string; to?: string } = {}) =>
  request<Summary>('/api/reports/summary', { query: range });

export type CashflowGranularity = 'day' | 'week' | 'month' | 'year';
export type ExpenseGranularity = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface Cashflow {
  range: Range;
  groupBy: CashflowGranularity;
  totals: { income: string; expenses: string; net: string; distributed: string };
  series: {
    bucket: string;
    income: string;
    expenses: string;
    net: string;
    incomeCount: number;
    expenseCount: number;
    distributed: { categoryId: string; name: string; total: string }[];
  }[];
}

export const getCashflow = (
  query: { from?: string; to?: string; groupBy?: CashflowGranularity } = {}
) => request<Cashflow>('/api/reports/cashflow', { query });

export interface ExpenseReport {
  range: Range;
  groupBy: ExpenseGranularity;
  total: string;
  count: number;
  average: string;
  busiest: { bucket: string; total: string } | null;
  byCategory: {
    categoryId: string | null;
    name: string;
    total: string;
    count: number;
    shareOfExpenses: number;
  }[];
  series: { bucket: string; total: string; count: number }[];
}

export const getExpenseReport = (
  query: {
    from?: string;
    to?: string;
    groupBy?: ExpenseGranularity;
    categoryId?: string;
    wallet?: Wallet;
  } = {}
) => request<ExpenseReport>('/api/reports/expenses', { query });

export interface DistributionReport {
  range: Range;
  income: string;
  distributed: string;
  undistributed: string;
  configuredTotalPercentage: number;
  percentageWarning: string | null;
  categories: {
    categoryId: string;
    name: string;
    configuredPercentage: string;
    total: string;
    count: number;
    effectivePercentage: number;
  }[];
}

export const getDistributionReport = (range: { from?: string; to?: string } = {}) =>
  request<DistributionReport>('/api/reports/distribution', { query: range });
