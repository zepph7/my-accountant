import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/auth_interceptor.dart';
import 'package:my__accountant/core/storage/secure_session_store.dart';
import 'package:my__accountant/core/storage/session.dart';
import 'package:my__accountant/core/storage/token_storage.dart';

import '../../helpers/fake_http_client_adapter.dart';

class InMemoryTokenStorage implements TokenStorage {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  test('on 401, refreshes once and replays the original request', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    await sessionStore.save(
      const Session(accessToken: 'stale', refreshToken: 'refresh-1'),
      remember: true,
    );

    var protectedCalls = 0;
    var refreshCalls = 0;
    bool signedOutCalled = false;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      if (options.uri.path == '/api/protected') {
        protectedCalls++;
        final authHeader = options.headers['Authorization'] as String?;
        if (authHeader == 'Bearer stale') {
          return _jsonBody({'success': false, 'message': 'expired'}, 401);
        }
        return _jsonBody({'success': true, 'data': 'ok'}, 200);
      }
      throw StateError('unexpected path ${options.uri.path}');
    });

    Future<Session?> performRefresh(String refreshToken) async {
      refreshCalls++;
      final session = const Session(accessToken: 'fresh', refreshToken: 'refresh-2');
      await sessionStore.updateStored(session);
      return session;
    }

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: performRefresh,
      retry: dio.fetch,
      onSignedOut: () => signedOutCalled = true,
    ));

    final response = await dio.get<dynamic>('/api/protected');

    expect(response.data, {'success': true, 'data': 'ok'});
    expect(protectedCalls, 2);
    expect(refreshCalls, 1);
    expect(signedOutCalled, isFalse);
  });

  test('signs out when the refresh is refused', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    await sessionStore.save(
      const Session(accessToken: 'stale', refreshToken: 'refresh-1'),
      remember: true,
    );
    bool signedOutCalled = false;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({'success': false, 'message': 'expired'}, 401);
    });

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: (_) async => null,
      retry: dio.fetch,
      onSignedOut: () => signedOutCalled = true,
    ));

    await expectLater(dio.get<dynamic>('/api/protected'), throwsA(isA<DioException>()));
    expect(signedOutCalled, isTrue);
    expect(sessionStore.current, isNull);
  });

  test('does not attach a token or attempt refresh for anonymous requests', () async {
    final sessionStore = SecureSessionStore(InMemoryTokenStorage());
    await sessionStore.save(
      const Session(accessToken: 'stale', refreshToken: 'refresh-1'),
      remember: true,
    );
    var refreshCalls = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.headers.containsKey('Authorization'), isFalse);
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    dio.interceptors.add(AuthInterceptor(
      sessionStore: sessionStore,
      performRefresh: (_) async {
        refreshCalls++;
        return null;
      },
      retry: dio.fetch,
    ));

    await dio.post<dynamic>('/api/auth/login', options: Options(extra: {'anonymous': true}));
    expect(refreshCalls, 0);
  });
}
