import {
  calculateDistribution,
  type DistributionCategoryInput,
} from '../../src/services/distribution.service';
import { toCents } from '../../src/utils/money';

const DEFAULTS: DistributionCategoryInput[] = [
  { id: 'a-essentials', name: 'Essentials', percentage: '60.00' },
  { id: 'b-savings', name: 'Savings', percentage: '20.00' },
  { id: 'c-investments', name: 'Investments', percentage: '10.00' },
  { id: 'd-emergency', name: 'Emergency', percentage: '10.00' },
];

const sumOf = (amounts: string[]) => amounts.reduce((acc, a) => acc + toCents(a), 0);

describe('calculateDistribution', () => {
  it('splits a clean amount exactly', () => {
    const { splits, percentageWarning } = calculateDistribution('1000.00', DEFAULTS);

    expect(splits.map((s) => s.amount)).toEqual(['600.00', '200.00', '100.00', '100.00']);
    expect(percentageWarning).toBe(false);
  });

  // The case that motivates the whole algorithm.
  it('assigns the rounding remainder to the largest category', () => {
    const { splits } = calculateDistribution('333.33', DEFAULTS);

    // Floors are 199.99 / 66.66 / 33.33 / 33.33 = 333.31, leaving 0.02.
    expect(splits.map((s) => s.amount)).toEqual(['200.01', '66.66', '33.33', '33.33']);
    expect(sumOf(splits.map((s) => s.amount))).toBe(toCents('333.33'));
  });

  it('sums exactly for a large sweep of awkward amounts', () => {
    for (let cents = 1; cents <= 2000; cents += 1) {
      const amount = (cents / 100).toFixed(2);
      const { splits } = calculateDistribution(amount, DEFAULTS);

      expect(sumOf(splits.map((s) => s.amount))).toBe(cents);
    }
  });

  it('handles the smallest possible income', () => {
    const { splits } = calculateDistribution('0.01', DEFAULTS);

    expect(sumOf(splits.map((s) => s.amount))).toBe(1);
    // The single cent lands in Essentials, not scattered.
    expect(splits[0]!.amount).toBe('0.01');
  });

  it('handles a single 100% category', () => {
    const { splits, percentageWarning } = calculateDistribution('987.65', [
      { id: 'only', name: 'Everything', percentage: '100.00' },
    ]);

    expect(splits).toHaveLength(1);
    expect(splits[0]!.amount).toBe('987.65');
    expect(percentageWarning).toBe(false);
  });

  it('warns but does not block when percentages do not total 100', () => {
    const { splits, percentageWarning, totalPercentage } = calculateDistribution('100.00', [
      { id: 'a', name: 'Essentials', percentage: '50.00' },
      { id: 'b', name: 'Savings', percentage: '30.00' },
    ]);

    expect(percentageWarning).toBe(true);
    expect(totalPercentage).toBe('80.00');
    // Crucially the missing 20% is NOT forced into a bucket.
    expect(sumOf(splits.map((s) => s.amount))).toBe(toCents('80.00'));
  });

  it('does not reallocate remainder when percentages are under 100', () => {
    const { splits } = calculateDistribution('333.33', [
      { id: 'a', name: 'Essentials', percentage: '33.33' },
    ]);

    // 333.33 * 33.33% = 111.099... floors to 111.09 and stays there.
    expect(splits[0]!.amount).toBe('111.09');
  });

  it('snapshots the percentage applied', () => {
    const { splits } = calculateDistribution('500.00', DEFAULTS);

    expect(splits.map((s) => s.percentageApplied)).toEqual([
      '60.00',
      '20.00',
      '10.00',
      '10.00',
    ]);
  });

  it('breaks ties on the lowest id for determinism', () => {
    const tied: DistributionCategoryInput[] = [
      { id: 'z-last', name: 'Z', percentage: '50.00' },
      { id: 'a-first', name: 'A', percentage: '50.00' },
    ];

    // 0.01 splits to 0.00 / 0.00 with a 0.01 remainder; both shares tie at 0.
    const { splits } = calculateDistribution('0.01', tied);
    const winner = splits.find((s) => s.amount === '0.01');

    expect(winner!.distributionCategoryId).toBe('a-first');
  });

  it('returns an empty split set when the user has no categories', () => {
    const { splits, percentageWarning } = calculateDistribution('100.00', []);

    expect(splits).toEqual([]);
    expect(percentageWarning).toBe(true);
  });

  it('rejects non-positive income', () => {
    expect(() => calculateDistribution('0.00', DEFAULTS)).toThrow('must be positive');
  });
});
