import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';

void main() {
  group('ApiException', () {
    test('defaults fieldErrors to empty', () {
      final e = ApiException(400, 'Bad request');
      expect(e.fieldErrors, isEmpty);
    });

    test('isTransient is true for status 0 (network failure)', () {
      expect(ApiException(0, 'offline').isTransient, isTrue);
    });

    test('isTransient is true for 5xx', () {
      expect(ApiException(500, 'server error').isTransient, isTrue);
      expect(ApiException(503, 'unavailable').isTransient, isTrue);
    });

    test('isTransient is false for 4xx', () {
      expect(ApiException(404, 'not found').isTransient, isFalse);
      expect(ApiException(422, 'validation').isTransient, isFalse);
    });

    test('carries field errors', () {
      final e = ApiException(422, 'Invalid', {'email': 'Enter a valid email.'});
      expect(e.fieldErrors['email'], 'Enter a valid email.');
    });
  });
}
