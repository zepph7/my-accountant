import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _expenseJson({String id = 'e1'}) => {
      'id': id,
      'user_id': 'u1',
      'category_id': 'c1',
      'category_name': 'Groceries',
      'occurred_at': '2026-08-09T14:05:00Z',
      'amount': '2500.00',
      'description': 'Weekly shop',
      'payee': 'Supermarket',
      'wallet': 'mpesa',
      'created_at': '2026-08-09T14:05:00Z',
      'updated_at': '2026-08-09T14:05:00Z',
    };

void main() {
  late Dio dio;
  late ExpenseRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = ExpenseRepository(ApiClient(dio));
  });

  test('listExpenses sends filters including search as query params', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses');
      expect(options.uri.queryParameters['search'], 'super');
      expect(options.uri.queryParameters['wallet'], 'mpesa');
      return _jsonBody({
        'success': true,
        'data': [_expenseJson()],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
      }, 200);
    });

    final page = await repository.listExpenses(wallet: Wallet.mpesa, search: 'super');
    expect(page.data.single.payee, 'Supermarket');
  });

  test('getExpense fetches by id', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses/e1');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    final expense = await repository.getExpense('e1');
    expect(expense.categoryName, 'Groceries');
  });

  test('createExpense posts the full input body', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/expenses');
      final body = options.data as Map<String, dynamic>;
      expect(body['occurredAt'], '2026-08-09T14:05:00Z');
      expect(body['wallet'], 'mpesa');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    await repository.createExpense(const ExpenseInput(
      categoryId: 'c1',
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '2500.00',
      payee: 'Supermarket',
      description: 'Weekly shop',
      wallet: Wallet.mpesa,
    ));
  });

  test('updateExpense patches by id', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'PATCH');
      expect(options.uri.path, '/api/expenses/e1');
      return _jsonBody({'success': true, 'data': _expenseJson()}, 200);
    });

    await repository.updateExpense(
      'e1',
      const ExpenseInput(
        categoryId: null,
        occurredAt: '2026-08-09T14:05:00Z',
        amount: '1',
        payee: null,
        description: null,
        wallet: Wallet.cash,
      ),
    );
  });

  test('deleteExpense sends DELETE', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'DELETE');
      expect(options.uri.path, '/api/expenses/e1');
      return ResponseBody.fromString('', 204);
    });

    await repository.deleteExpense('e1');
  });
}
