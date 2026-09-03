import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/core/network/api_exception.dart';

import '../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  late Dio dio;
  late ApiClient client;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    client = ApiClient(dio);
  });

  test('returns parsed data on success', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/thing');
      return _jsonBody({
        'success': true,
        'data': {'id': '1'},
      }, 200);
    });

    final result = await client.request<String>(
      '/api/thing',
      parse: (json) => (json as Map<String, dynamic>)['id'] as String,
    );
    expect(result, '1');
  });

  test('drops null, empty-string and undefined query values', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.queryParameters, {'wallet': 'cash'});
      return _jsonBody({'success': true, 'data': null}, 200);
    });

    await client.request<void>(
      '/api/thing',
      query: {'wallet': 'cash', 'sourceId': null, 'search': ''},
      parse: (_) {},
    );
  });

  test('throws ApiException with field errors on a validation failure', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      return _jsonBody({
        'success': false,
        'message': 'Invalid',
        'errors': [
          {'field': 'email', 'message': 'Bad email'},
        ],
      }, 422);
    });

    await expectLater(
      client.request<void>('/api/thing', method: 'POST', parse: (_) {}),
      throwsA(isA<ApiException>()
          .having((e) => e.status, 'status', 422)
          .having((e) => e.fieldErrors['email'], 'email error', 'Bad email')),
    );
  });

  test('throws a transient ApiException on a network failure', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    });

    await expectLater(
      client.request<void>('/api/thing', parse: (_) {}),
      throwsA(isA<ApiException>().having((e) => e.isTransient, 'isTransient', isTrue)),
    );
  });

  test('sends explicit headers and anonymous flag through', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.headers['Authorization'], 'Bearer explicit-token');
      return _jsonBody({
        'success': true,
        'data': {'ok': true},
      }, 200);
    });

    await client.request<void>(
      '/api/auth/me',
      anonymous: true,
      headers: {'Authorization': 'Bearer explicit-token'},
      parse: (_) {},
    );
  });
}
