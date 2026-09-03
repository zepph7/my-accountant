// my__accountant/lib/core/network/providers.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/secure_session_store.dart';
import '../storage/token_storage.dart';
import 'api_client.dart';
import 'dio_client.dart';

final sessionStoreProvider = Provider<SecureSessionStore>((ref) {
  return SecureSessionStore(const SecureTokenStorage());
});

final dioProvider = Provider<Dio>((ref) {
  return buildDio(sessionStore: ref.watch(sessionStoreProvider));
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(dioProvider));
});
