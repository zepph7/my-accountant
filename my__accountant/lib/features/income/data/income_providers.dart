import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import 'income_repository.dart';
import 'income_source_repository.dart';

final incomeRepositoryProvider = Provider<IncomeRepository>((ref) {
  return IncomeRepository(ref.watch(apiClientProvider));
});

final incomeSourceRepositoryProvider = Provider<IncomeSourceRepository>((ref) {
  return IncomeSourceRepository(ref.watch(apiClientProvider));
});
