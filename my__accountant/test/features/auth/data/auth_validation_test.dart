import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/features/auth/data/auth_validation.dart';

void main() {
  group('normalizePhone', () {
    test('strips spaces, dashes, dots and parens', () {
      expect(normalizePhone(' +254 (712) 345-678 '), '+254712345678');
    });
  });

  group('validateEmail', () {
    test('requires a value', () => expect(validateEmail(''), isNotNull));
    test('requires a complete address', () => expect(validateEmail('not-an-email'), isNotNull));
    test('accepts a valid address', () => expect(validateEmail('a@b.com'), isNull));
    test('rejects an address over 255 chars',
        () => expect(validateEmail('${'a' * 250}@b.com'), isNotNull));
  });

  group('validatePhone', () {
    test('requires a value', () => expect(validatePhone(''), isNotNull));
    test('requires E.164', () => expect(validatePhone('0712345678'), isNotNull));
    test('accepts E.164', () => expect(validatePhone('+254712345678'), isNull));
  });

  group('identifierKind', () {
    test('a leading + or digit is a phone', () {
      expect(identifierKind('+254712345678'), IdentifierKind.phone);
      expect(identifierKind('0712345678'), IdentifierKind.phone);
    });
    test('anything else is an email', () {
      expect(identifierKind('a@b.com'), IdentifierKind.email);
    });
  });

  group('validateIdentifier', () {
    test('requires a value', () => expect(validateIdentifier(''), isNotNull));
    test('validates as phone when it looks like one',
        () => expect(validateIdentifier('0712345678'), isNotNull));
    test('validates as email otherwise', () => expect(validateIdentifier('a@b.com'), isNull));
  });

  group('identifierCredential', () {
    test('normalizes a phone identifier', () {
      final cred = identifierCredential('0712 345 678');
      expect(cred.phone, '0712345678');
      expect(cred.email, isNull);
    });
    test('trims an email identifier', () {
      final cred = identifierCredential(' a@b.com ');
      expect(cred.email, 'a@b.com');
      expect(cred.phone, isNull);
    });
  });

  group('validatePassword', () {
    test('requires a value', () => expect(validatePassword(''), isNotNull));
    test('requires at least 10 characters', () => expect(validatePassword('Ab1defg'), isNotNull));
    test('requires upper, lower and a digit',
        () => expect(validatePassword('alllowercase1'), isNotNull));
    test('accepts a compliant password', () => expect(validatePassword('Abcdefghij1'), isNull));
    test('rejects over 72 characters', () => expect(validatePassword('Aa1${'a' * 72}'), isNotNull));
  });

  group('validateName', () {
    test('requires a value', () => expect(validateName('', 'first name'), isNotNull));
    test('rejects over 100 characters',
        () => expect(validateName('a' * 101, 'first name'), isNotNull));
    test('accepts a normal name', () => expect(validateName('Jane', 'first name'), isNull));
  });
}
