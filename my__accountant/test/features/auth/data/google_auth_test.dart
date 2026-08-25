import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/core/network/api_exception.dart';
import 'package:my__accountant/features/auth/data/google_auth.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  group('parseGoogleCallback', () {
    test('extracts tokens from the callback query string', () {
      final result = parseGoogleCallback(
        'myaccountant://auth/callback?access_token=a&refresh_token=r',
      );
      expect(result.accessToken, 'a');
      expect(result.refreshToken, 'r');
    });

    test('throws with the server message when tokens are missing', () {
      expect(
        () => parseGoogleCallback('myaccountant://auth/callback?message=Linked+to+another+account'),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Linked to another account',
        )),
      );
    });

    test('throws a generic message when neither tokens nor a message are present', () {
      expect(
        () => parseGoogleCallback('myaccountant://auth/callback'),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Google sign-in did not complete. Try again.',
        )),
      );
    });
  });

  group('GoogleAuthService.continueWithGoogle', () {
    test('returns null when the user backs out of the browser', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      final service = GoogleAuthService(
        ApiClient(dio),
        authenticate: (url, scheme) async => throw Exception('user canceled'),
      );

      expect(await service.continueWithGoogle(), isNull);
    });

    test('fetches the profile with the callback access token and returns AuthResult', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/auth/me');
        expect(options.headers['Authorization'], 'Bearer access-1');
        return _jsonBody({
          'success': true,
          'data': {
            'id': 'u1',
            'email': 'a@b.com',
            'phone': null,
            'firstName': 'Jane',
            'lastName': 'Doe',
            'avatarUrl': null,
            'role': 'user',
            'timezone': 'Africa/Nairobi',
            'isVerified': true,
            'createdAt': '2026-01-01T00:00:00Z',
          },
        }, 200);
      });

      final service = GoogleAuthService(
        ApiClient(dio),
        authenticate: (url, scheme) async {
          expect(url, 'https://example.test/api/auth/google');
          expect(scheme, 'myaccountant');
          return 'myaccountant://auth/callback?access_token=access-1&refresh_token=refresh-1';
        },
      );

      final result = await service.continueWithGoogle();
      expect(result?.accessToken, 'access-1');
      expect(result?.user.firstName, 'Jane');
    });
  });
}
