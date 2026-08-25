import '../../../core/network/api_client.dart';
import '../../../core/network/page.dart';
import '../../../shared/named_record.dart';

class IncomeSourceRepository {
  IncomeSourceRepository(this._client);

  final ApiClient _client;

  Future<Page<NamedRecord>> list({String? search}) {
    return _client.request(
      '/api/income-sources',
      query: {'limit': 100, 'sort': 'name', 'order': 'asc', if (search != null) 'search': search},
      parse: (json) => Page.fromJson<NamedRecord>(json as Map<String, dynamic>, NamedRecord.fromJson),
    );
  }

  Future<NamedRecord> create(String name) {
    return _client.request(
      '/api/income-sources',
      method: 'POST',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<NamedRecord> rename(String id, String name) {
    return _client.request(
      '/api/income-sources/$id',
      method: 'PATCH',
      body: {'name': name},
      parse: (json) => NamedRecord.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> remove(String id) {
    return _client.request<void>('/api/income-sources/$id', method: 'DELETE', parse: (_) {});
  }
}
