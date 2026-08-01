import { fromCents, sumCents, toCents } from '../utils/money';

export interface DistributionCategoryInput {
  id: string;
  name: string;
  /** Decimal string as stored in NUMERIC(5,2), e.g. "60.00". */
  percentage: string;
}

export interface DistributionSplit {
  distributionCategoryId: string;
  name: string;
  /** Decimal string, safe to insert into NUMERIC(12,2). */
  amount: string;
  /** The percentage in force at distribution time, snapshotted onto the row. */
  percentageApplied: string;
}

export interface DistributionResult {
  splits: DistributionSplit[];
  /** True when the user's percentages do not total 100. Warn, never block. */
  percentageWarning: boolean;
  totalPercentage: string;
}

/**
 * Splits an income across the user's distribution categories.
 *
 * The invariant that matters: the returned amounts sum EXACTLY to the income.
 * Naively rounding each share independently breaks this — 333.33 split
 * 60/20/10/10 floors to 199.99 + 66.66 + 33.33 + 33.33 = 333.31, losing two
 * cents per payslip forever.
 *
 * So we floor every share, then hand the entire accumulated remainder to the
 * largest share. Largest-remainder would spread it more "fairly", but for a
 * budgeting app the intuitive result is that the rounding dust lands in the
 * biggest bucket (Essentials), not scattered a cent at a time across Savings
 * and Emergency. Ties break on the lowest id so the outcome is deterministic
 * and reproducible in tests.
 *
 * Pure function: no DB, no clock, no I/O. The caller persists the result inside
 * the same transaction as the income row.
 */
export const calculateDistribution = (
  incomeAmount: string,
  categories: DistributionCategoryInput[]
): DistributionResult => {
  const totalCents = toCents(incomeAmount);

  if (totalCents <= 0) {
    throw new Error('Income amount must be positive');
  }

  const totalPercentageBasisPoints = categories.reduce(
    (acc, c) => acc + Math.round(Number(c.percentage) * 100),
    0
  );

  if (categories.length === 0) {
    return {
      splits: [],
      percentageWarning: true,
      totalPercentage: '0.00',
    };
  }

  // Floor each share. Working in basis points (percentage * 100) keeps the
  // intermediate exact for two-decimal percentages such as 33.33.
  const floored = categories.map((category) => {
    const basisPoints = Math.round(Number(category.percentage) * 100);
    const amountCents = Math.floor((totalCents * basisPoints) / 10_000);

    return { category, basisPoints, amountCents };
  });

  const distributedCents = sumCents(floored.map((f) => f.amountCents));
  const remainder = totalCents - distributedCents;

  // Only reallocate when the percentages actually claim the whole income. If a
  // user's categories sum to 80%, the missing 20% is intentional and must NOT
  // be forced into a bucket.
  if (remainder !== 0 && totalPercentageBasisPoints === 10_000) {
    const target = floored.reduce((largest, current) => {
      if (current.amountCents > largest.amountCents) return current;
      if (current.amountCents < largest.amountCents) return largest;
      return current.category.id < largest.category.id ? current : largest;
    });

    target.amountCents += remainder;
  }

  return {
    splits: floored.map(({ category, amountCents }) => ({
      distributionCategoryId: category.id,
      name: category.name,
      amount: fromCents(amountCents),
      percentageApplied: Number(category.percentage).toFixed(2),
    })),
    percentageWarning: totalPercentageBasisPoints !== 10_000,
    totalPercentage: (totalPercentageBasisPoints / 100).toFixed(2),
  };
};
