import 'dart:typed_data';

import 'package:dio/dio.dart';

/// A minimal `HttpClientAdapter` for tests, per dio's own documented testing
/// pattern — avoids hitting the network or depending on a mocking package
/// whose matcher API might not match what's actually installed.
class FakeHttpClientAdapter implements HttpClientAdapter {
  FakeHttpClientAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);

  @override
  void close({bool force = false}) {}
}
