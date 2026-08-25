import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import '../../income/data/income_models.dart' show Wallet;
import 'expense_models.dart';

class ExpenseRepository {
  ExpenseRepository(this._client);

  final ApiClient _client;

  Future<Page<Expense>> listExpenses({
    int page = 1,
    int limit = 20,
    String? categoryId,
    Wallet? wallet,
    String? search,
    String? from,
    String? to,
  }) {
    return _client.request(
      '/api/expenses',
      query: {
        'page': page,
        'limit': limit,
        if (categoryId != null) 'categoryId': categoryId,
        if (wallet != null) 'wallet': wallet.value,
        if (search != null) 'search': search,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      },
      parse: (json) => Page.fromJson<Expense>(json as Map<String, dynamic>, Expense.fromJson),
    );
  }

  Future<Expense> getExpense(String id) {
    return _client.request(
      '/api/expenses/$id',
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<Expense> createExpense(ExpenseInput input) {
    return _client.request(
      '/api/expenses',
      method: 'POST',
      body: input.toJson(),
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<Expense> updateExpense(String id, ExpenseInput input) {
    return _client.request(
      '/api/expenses/$id',
      method: 'PATCH',
      body: input.toJson(),
      parse: (json) => Expense.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> deleteExpense(String id) {
    return _client.request<void>('/api/expenses/$id', method: 'DELETE', parse: (_) {});
  }
}
