import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/auth/data/auth_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _userJson() => {
      'id': 'u1',
      'email': 'a@b.com',
      'phone': '+254712345678',
      'firstName': 'Jane',
      'lastName': 'Doe',
      'avatarUrl': null,
      'role': 'user',
      'timezone': 'Africa/Nairobi',
      'isVerified': true,
      'createdAt': '2026-01-01T00:00:00Z',
    };

void main() {
  late Dio dio;
  late AuthRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = AuthRepository(ApiClient(dio));
  });

  test('signIn sends the identifier under email or phone and renames on error', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/login');
      expect(options.extra['anonymous'], isTrue);
      return _jsonBody({
        'success': true,
        'data': {'accessToken': 'a', 'refreshToken': 'r', 'user': _userJson()},
      }, 200);
    });

    final result = await repository.signIn(email: 'a@b.com', password: 'Abcdefghij1');
    expect(result.accessToken, 'a');
    expect(result.user.firstName, 'Jane');
  });

  test('createAccount posts to register', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/register');
      final body = options.data as Map<String, dynamic>;
      expect(body['email'], 'a@b.com');
      expect(body['phone'], '+254712345678');
      return _jsonBody({
        'success': true,
        'data': {'accessToken': 'a', 'refreshToken': 'r', 'user': _userJson()},
      }, 200);
    });

    final result = await repository.createAccount(
      email: 'a@b.com',
      phone: '+254712345678',
      password: 'Abcdefghij1',
      firstName: 'Jane',
      lastName: 'Doe',
    );
    expect(result.user.id, 'u1');
  });

  test('getProfile fetches /api/auth/me', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/auth/me');
      return _jsonBody({'success': true, 'data': _userJson()}, 200);
    });

    final user = await repository.getProfile();
    expect(user.email, 'a@b.com');
  });

  test('updateProfile only sends provided fields', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      final body = options.data as Map<String, dynamic>;
      expect(body.containsKey('firstName'), isTrue);
      expect(body.containsKey('lastName'), isFalse);
      return _jsonBody({'success': true, 'data': _userJson()}, 200);
    });

    await repository.updateProfile(firstName: 'Janet');
  });

  test('signOutRemote does nothing without a refresh token', () async {
    var called = false;
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      called = true;
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    await repository.signOutRemote(null);
    expect(called, isFalse);
  });

  test('signOutRemote swallows a failed logout call', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({'success': false, 'message': 'gone'}, 400);
    });

    await repository.signOutRemote('refresh-token'); // must not throw
  });
}
