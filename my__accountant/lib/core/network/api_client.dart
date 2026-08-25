import 'package:dio/dio.dart';

import 'api_exception.dart';
import 'envelope.dart';

/// The transport every repository goes through. Wraps a `Dio` instance
/// (already carrying [AuthInterceptor]) with envelope unwrapping and query
/// cleaning. Mirrors `request()` in `lib/api.ts`.
class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Future<T> request<T>(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, dynamic>? query,
    bool anonymous = false,
    Map<String, String> renameFields = const {},
    Map<String, String>? headers,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: _cleanQuery(query),
        options: Options(method: method, headers: headers, extra: {'anonymous': anonymous}),
      );
      if (response.statusCode == 204) return parse(null);
      final data = unwrapEnvelope(
        response.data as Map<String, dynamic>,
        response.statusCode ?? 0,
        renameFields: renameFields,
      );
      return parse(data);
    } on DioException catch (e) {
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        // unwrapEnvelope throws on failure, which is the expected outcome
        // here — dio flagged this as an error status, so the envelope's
        // `success` field is almost always false too.
        final data = unwrapEnvelope(
          responseData,
          e.response!.statusCode ?? 0,
          renameFields: renameFields,
        );
        return parse(data);
      }
      throw ApiException(0, 'Could not reach the server. Check your connection and try again.');
    }
  }

  Map<String, dynamic>? _cleanQuery(Map<String, dynamic>? query) {
    if (query == null) return null;
    final cleaned = <String, dynamic>{};
    for (final entry in query.entries) {
      if (entry.value == null || entry.value == '') continue;
      cleaned[entry.key] = entry.value;
    }
    return cleaned.isEmpty ? null : cleaned;
  }
}
