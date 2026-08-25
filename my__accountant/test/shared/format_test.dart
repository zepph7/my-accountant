import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/format.dart';

void main() {
  group('money', () {
    test('groups thousands and always shows two decimals', () {
      expect(money('1234.5'), '1,234.50');
      expect(money('1234567'), '1,234,567.00');
    });
    test('handles null/empty as zero', () {
      expect(money(null), '0.00');
    });
    test('preserves a negative sign', () {
      expect(money('-1234.5'), '-1,234.50');
    });
  });

  group('currency', () {
    test('appends the currency code', () {
      expect(currency('100'), '100.00 $currencyCode');
    });
  });

  group('longDate', () {
    test('formats a bare date', () => expect(longDate('2026-08-09'), '9 Aug 2026'));
    test('formats a date with a time component',
        () => expect(longDate('2026-08-09T14:05:00Z'), '9 Aug 2026'));
    test('returns an em dash for null/empty', () {
      expect(longDate(null), '—');
      expect(longDate(''), '—');
    });
  });

  group('shortDate', () {
    test('omits the year for the current year', () {
      final thisYear = DateTime.now().year;
      expect(shortDate('$thisYear-08-09'), '9 Aug');
    });
    test('includes the year for a different year',
        () => expect(shortDate('2020-08-09'), '9 Aug 2020'));
  });

  group('dateTime', () {
    test('formats date and time', () {
      final result = dateTime('2026-08-09T14:05:00Z');
      expect(result, contains('9 Aug'));
      expect(result, contains(':'));
    });
    test('returns an em dash for null', () => expect(dateTime(null), '—'));
  });

  group('today', () {
    test('matches YYYY-MM-DD format', () {
      expect(today(), matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    });
  });

  group('percent', () {
    test('trims a trailing .0', () => expect(percent('12.0'), '12%'));
    test('keeps one decimal otherwise', () => expect(percent('12.5'), '12.5%'));
    test('handles null as zero', () => expect(percent(null), '0%'));
  });
}
