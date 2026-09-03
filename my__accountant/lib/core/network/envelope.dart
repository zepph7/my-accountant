import 'api_exception.dart';

Map<String, String> _fieldErrorsFrom(
  List<dynamic>? errors,
  Map<String, String> rename,
) {
  final mapped = <String, String>{};
  for (final raw in errors ?? const []) {
    final issue = raw as Map<String, dynamic>;
    final rawField = issue['field'] as String;
    final field = rename[rawField] ?? rawField;
    if (field == '(root)') continue;
    // First message per field wins.
    mapped.putIfAbsent(field, () => issue['message'] as String);
  }
  return mapped;
}

/// Unwraps the API envelope `{success, data, message, errors, pagination}`.
///
/// Listing endpoints put the rows and page metadata at the top level rather
/// than inside `data`, alongside resource-level extras (e.g. the
/// distribution list's `totalPercentage`) — when `pagination` is present,
/// everything but the envelope bookkeeping is returned instead of just
/// `data`, mirroring `lib/api.ts`'s `request()`.
dynamic unwrapEnvelope(
  Map<String, dynamic> json,
  int status, {
  Map<String, String> renameFields = const {},
}) {
  final success = json['success'] == true;
  if (!success) {
    final message = json['message'] as String? ??
        (status >= 500
            ? 'The server ran into a problem. Try again in a moment.'
            : 'That request could not be completed.');
    throw ApiException(
      status,
      message,
      _fieldErrorsFrom(json['errors'] as List<dynamic>?, renameFields),
    );
  }

  if (json['pagination'] != null) {
    final rest = Map<String, dynamic>.from(json)
      ..remove('success')
      ..remove('message')
      ..remove('errors');
    return rest;
  }

  return json['data'];
}
