import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/api_client.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';

import '../../../helpers/fake_http_client_adapter.dart';

ResponseBody _jsonBody(Map<String, dynamic> json, int status) => ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> _incomeJson({String id = 'i1'}) => {
      'id': id,
      'user_id': 'u1',
      'source_id': 's1',
      'source_name': 'Salary',
      'date': '2026-08-01',
      'amount': '50000.00',
      'notes': null,
      'wallet': 'account',
      'created_at': '2026-08-01T00:00:00Z',
      'updated_at': '2026-08-01T00:00:00Z',
    };

Map<String, dynamic> _incomeDetailJson() => {
      ..._incomeJson(),
      'distribution': [
        {
          'id': 'd1',
          'distribution_category_id': 'dc1',
          'category_name': 'Essentials',
          'amount': '30000.00',
          'percentage_applied': '60.00',
        },
      ],
    };

void main() {
  late Dio dio;
  late IncomeRepository repository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    repository = IncomeRepository(ApiClient(dio));
  });

  test('listIncomes sends filters as query params and parses a page', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes');
      expect(options.uri.queryParameters['page'], '2');
      expect(options.uri.queryParameters['wallet'], 'cash');
      return _jsonBody({
        'success': true,
        'data': [_incomeJson()],
        'pagination': {'page': 2, 'limit': 20, 'total': 21, 'totalPages': 2},
      }, 200);
    });

    final page = await repository.listIncomes(page: 2, wallet: Wallet.cash);
    expect(page.data.single.id, 'i1');
    expect(page.pagination.total, 21);
  });

  test('getIncome fetches the detail with distribution', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes/i1');
      return _jsonBody({'success': true, 'data': _incomeDetailJson()}, 200);
    });

    final detail = await repository.getIncome('i1');
    expect(detail.distribution.single.categoryName, 'Essentials');
  });

  test('createIncome posts the full input body', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.uri.path, '/api/incomes');
      final body = options.data as Map<String, dynamic>;
      expect(body['sourceId'], 's1');
      expect(body['amount'], '50000.00');
      expect(body['wallet'], 'account');
      return _jsonBody({'success': true, 'data': _incomeDetailJson()}, 200);
    });

    await repository.createIncome(const IncomeInput(
      sourceId: 's1',
      date: '2026-08-01',
      amount: '50000.00',
      notes: null,
      wallet: Wallet.account,
    ));
  });

  test('updateIncome patches and can surface a distribution warning', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'PATCH');
      return _jsonBody({
        'success': true,
        'data': {..._incomeDetailJson(), 'warning': 'Distribution percentages total 90%.'},
      }, 200);
    });

    final result = await repository.updateIncome(
      'i1',
      const IncomeInput(sourceId: null, date: '2026-08-01', amount: '1', notes: null, wallet: Wallet.cash),
    );
    expect(result.warning, 'Distribution percentages total 90%.');
  });

  test('deleteIncome sends DELETE', () async {
    dio.httpClientAdapter = FakeHttpClientAdapter((options) async {
      expect(options.method, 'DELETE');
      expect(options.uri.path, '/api/incomes/i1');
      return ResponseBody.fromString('', 204);
    });

    await repository.deleteIncome('i1');
  });
}
