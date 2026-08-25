import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/page.dart';
import '../../../shared/paged_list.dart';
import '../data/income_models.dart';
import '../data/income_providers.dart';

class IncomeListNotifier extends PagedListNotifier<Income> {
  Wallet? _wallet;

  void setWalletFilter(Wallet? wallet) {
    _wallet = wallet;
    reload();
  }

  @override
  Future<Page<Income>> fetchPage(int page) {
    return ref.read(incomeRepositoryProvider).listIncomes(page: page, wallet: _wallet);
  }
}

final incomeListProvider = NotifierProvider<IncomeListNotifier, PagedListState<Income>>(
  IncomeListNotifier.new,
);
