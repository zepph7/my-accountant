import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/page.dart';
import '../../../shared/paged_list.dart';
import '../../income/data/income_models.dart' show Wallet;
import '../data/expense_models.dart';
import '../data/expense_providers.dart';

class ExpenseListNotifier extends PagedListNotifier<Expense> {
  Wallet? _wallet;
  String? _search;

  void setWalletFilter(Wallet? wallet) {
    _wallet = wallet;
    reload();
  }

  void setSearch(String? search) {
    _search = search;
    reload();
  }

  @override
  Future<Page<Expense>> fetchPage(int page) {
    return ref
        .read(expenseRepositoryProvider)
        .listExpenses(page: page, wallet: _wallet, search: _search);
  }
}

final expenseListProvider = NotifierProvider<ExpenseListNotifier, PagedListState<Expense>>(
  ExpenseListNotifier.new,
);
