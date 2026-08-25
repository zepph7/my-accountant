import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import 'income_models.dart';

/// Mirrors the income half of `lib/endpoints.ts`.
class IncomeRepository {
  IncomeRepository(this._client);

  final ApiClient _client;

  Future<Page<Income>> listIncomes({
    int page = 1,
    int limit = 20,
    String? sourceId,
    Wallet? wallet,
    String? from,
    String? to,
  }) {
    return _client.request(
      '/api/incomes',
      query: {
        'page': page,
        'limit': limit,
        if (sourceId != null) 'sourceId': sourceId,
        if (wallet != null) 'wallet': wallet.value,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      },
      parse: (json) => Page.fromJson<Income>(json as Map<String, dynamic>, Income.fromJson),
    );
  }

  Future<IncomeDetail> getIncome(String id) {
    return _client.request(
      '/api/incomes/$id',
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<IncomeDetail> createIncome(IncomeInput input) {
    return _client.request(
      '/api/incomes',
      method: 'POST',
      body: input.toJson(),
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<IncomeDetail> updateIncome(String id, IncomeInput input) {
    return _client.request(
      '/api/incomes/$id',
      method: 'PATCH',
      body: input.toJson(),
      parse: (json) => IncomeDetail.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> deleteIncome(String id) {
    return _client.request<void>('/api/incomes/$id', method: 'DELETE', parse: (_) {});
  }
}
