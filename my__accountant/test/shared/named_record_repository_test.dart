import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/expense/data/expense_category_repository.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';

import '../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  group('IncomeSourceRepository', () {
    late Dio dio;
    late IncomeSourceRepository repository;

    setUp(() {
      dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      repository = IncomeSourceRepository(ApiClient(dio));
    });

    test('list hits /api/income-sources and parses a page', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources');
        expect(options.uri.queryParameters['limit'], '100');
        return _jsonBody({
          'success': true,
          'data': [
            {'id': 's1', 'name': 'Salary'}
          ],
          'pagination': {'page': 1, 'limit': 100, 'total': 1, 'totalPages': 1},
        }, 200);
      });

      final page = await repository.list();
      expect(page.data.single.name, 'Salary');
    });

    test('create posts the name', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources');
        expect((options.data as Map<String, dynamic>)['name'], 'Freelance');
        return _jsonBody({
          'success': true,
          'data': {'id': 's2', 'name': 'Freelance'},
        }, 200);
      });

      final created = await repository.create('Freelance');
      expect(created.id, 's2');
    });

    test('rename patches by id', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources/s1');
        expect(options.method, 'PATCH');
        return _jsonBody({
          'success': true,
          'data': {'id': 's1', 'name': 'Salary (new job)'},
        }, 200);
      });

      final renamed = await repository.rename('s1', 'Salary (new job)');
      expect(renamed.name, 'Salary (new job)');
    });

    test('remove deletes by id', () async {
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/income-sources/s1');
        expect(options.method, 'DELETE');
        return ResponseBody.fromString('', 204);
      });

      await repository.remove('s1');
    });
  });

  group('ExpenseCategoryRepository', () {
    test('list hits /api/expense-categories', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
        expect(options.uri.path, '/api/expense-categories');
        return _jsonBody({
          'success': true,
          'data': <dynamic>[],
          'pagination': {'page': 1, 'limit': 100, 'total': 0, 'totalPages': 0},
        }, 200);
      });

      final repository = ExpenseCategoryRepository(ApiClient(dio));
      final page = await repository.list();
      expect(page.data, isEmpty);
    });
  });
}
