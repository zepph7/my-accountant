// my__accountant/test/shared/money_validation_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/money_validation.dart';

void main() {
  group('normalizeAmount', () {
    test('strips grouping commas and spaces', () {
      expect(normalizeAmount('1,500.50'), '1500.50');
      expect(normalizeAmount(' 1500 '), '1500');
    });
    test('strips a leading currency symbol', () {
      expect(normalizeAmount('KES 1500'), '1500');
      expect(normalizeAmount(r'$1500'), '1500');
    });
  });

  group('validateAmount', () {
    test('requires a value', () => expect(validateAmount(''), isNotNull));
    test('requires digits with at most two decimals',
        () => expect(validateAmount('12.345'), isNotNull));
    test('accepts a whole number', () => expect(validateAmount('1500'), isNull));
    test('accepts two decimals', () => expect(validateAmount('1500.50'), isNull));
    test('rejects zero', () => expect(validateAmount('0'), isNotNull));
    test('rejects negative-looking input (fails the digit pattern)',
        () => expect(validateAmount('-5'), isNotNull));
    test('rejects an amount at or above the ceiling',
        () => expect(validateAmount('10000000000'), isNotNull));
    test('accepts an amount just under the ceiling',
        () => expect(validateAmount('9999999999.99'), isNull));
  });

  group('validateBalance', () {
    test('requires a value', () => expect(validateBalance(''), isNotNull));
    test('accepts zero, unlike validateAmount', () => expect(validateBalance('0'), isNull));
    test('rejects an out-of-range balance',
        () => expect(validateBalance('10000000000'), isNotNull));
  });

  group('validatePercentage', () {
    test('requires a value', () => expect(validatePercentage(''), isNotNull));
    test('accepts 0', () => expect(validatePercentage('0'), isNull));
    test('accepts 100', () => expect(validatePercentage('100'), isNull));
    test('rejects over 100', () => expect(validatePercentage('100.01'), isNotNull));
    test('rejects negative', () => expect(validatePercentage('-1'), isNotNull));
    test('accepts two decimals', () => expect(validatePercentage('33.33'), isNull));
  });

  group('validateLabel', () {
    test('requires a value', () => expect(validateLabel('', 'name'), isNotNull));
    test('rejects over 255 chars', () => expect(validateLabel('a' * 256, 'name'), isNotNull));
    test('accepts a normal label', () => expect(validateLabel('Salary', 'name'), isNull));
  });
}
