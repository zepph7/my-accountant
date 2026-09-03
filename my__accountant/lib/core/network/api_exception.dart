/// A failed API request, carrying whatever the server could attribute to a
/// particular field so a form can put the message next to the input that
/// caused it. Mirrors `lib/api.ts`'s `ApiError` in the RN app.
class ApiException implements Exception {
  ApiException(this.status, this.message, [this.fieldErrors = const {}]);

  final int status;
  final String message;
  final Map<String, String> fieldErrors;

  /// True when retrying the same request might work: no response reached the
  /// device (status 0) or the server reported its own failure (5xx).
  bool get isTransient => status == 0 || status >= 500;

  @override
  String toString() => 'ApiException($status, $message)';
}
