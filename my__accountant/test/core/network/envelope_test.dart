import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/core/network/envelope.dart';

void main() {
  group('unwrapEnvelope', () {
    test('returns data on success', () {
      final result = unwrapEnvelope({
        'success': true,
        'data': {'id': '1'},
      }, 200);
      expect(result, {'id': '1'});
    });

    test('returns everything but envelope bookkeeping when pagination is present', () {
      final result = unwrapEnvelope({
        'success': true,
        'data': [
          {'id': '1'}
        ],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
        'totalPercentage': 100,
      }, 200);
      expect(result, {
        'data': [
          {'id': '1'}
        ],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
        'totalPercentage': 100,
      });
    });

    test('throws ApiException with server message on failure', () {
      expect(
        () => unwrapEnvelope({'success': false, 'message': 'Nope'}, 422),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 422)
            .having((e) => e.message, 'message', 'Nope')),
      );
    });

    test('falls back to a 5xx message when the server sent none', () {
      expect(
        () => unwrapEnvelope({'success': false}, 500),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'The server ran into a problem. Try again in a moment.',
        )),
      );
    });

    test('falls back to a generic message for a non-5xx failure with none', () {
      expect(
        () => unwrapEnvelope({'success': false}, 400),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', 'That request could not be completed.')),
      );
    });

    test('maps field errors, renames fields, skips (root), first message wins', () {
      expect(
        () => unwrapEnvelope({
          'success': false,
          'errors': [
            {'field': 'email', 'message': 'Bad email'},
            {'field': 'email', 'message': 'Second message, ignored'},
            {'field': '(root)', 'message': 'ignored entirely'},
            {'field': 'phone', 'message': 'Bad phone'},
          ],
        }, 422, renameFields: {'email': 'identifier', 'phone': 'identifier'}),
        throwsA(isA<ApiException>().having(
          (e) => e.fieldErrors,
          'fieldErrors',
          {'identifier': 'Bad email'},
        )),
      );
    });
  });
}
