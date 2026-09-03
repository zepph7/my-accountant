import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import 'expense_category_repository.dart';
import 'expense_repository.dart';

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository(ref.watch(apiClientProvider));
});

final expenseCategoryRepositoryProvider = Provider<ExpenseCategoryRepository>((ref) {
  return ExpenseCategoryRepository(ref.watch(apiClientProvider));
});
