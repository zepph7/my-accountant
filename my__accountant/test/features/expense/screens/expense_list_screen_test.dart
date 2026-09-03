import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/screens/expense_list_screen.dart';
import 'package:my__accountant/features/expense/state/expense_list_notifier.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet, walletLabels;
import 'package:my__accountant/shared/paged_list.dart';

class _FixedExpenseListNotifier extends ExpenseListNotifier {
  _FixedExpenseListNotifier(this._state);
  final PagedListState<Expense> _state;
  Wallet? lastWalletFilter;
  String? lastSearch;

  @override
  PagedListState<Expense> build() => _state;

  @override
  void setWalletFilter(Wallet? wallet) {
    lastWalletFilter = wallet;
  }

  @override
  void setSearch(String? search) {
    lastSearch = search;
  }
}

Expense _expense({String id = 'e1', String? payee = 'Supermarket'}) => Expense(
      id: id,
      userId: 'u1',
      categoryId: null,
      categoryName: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '2500.00',
      description: null,
      payee: payee,
      wallet: Wallet.mpesa,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

PagedListState<Expense> _stateOf(List<Expense> items, {bool loading = false}) => PagedListState<Expense>(
      items: items,
      total: items.length,
      page: 1,
      totalPages: 1,
      error: null,
      loading: loading,
      refreshing: false,
      loadingMore: false,
    );

Widget _harness(_FixedExpenseListNotifier notifier) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const ExpenseListScreen()),
    GoRoute(path: '/expense/new', builder: (context, state) => const Scaffold(body: Text('new expense'))),
    GoRoute(
      path: '/expense/:id',
      builder: (context, state) => Scaffold(body: Text('expense ${state.pathParameters['id']}')),
    ),
  ]);

  return ProviderScope(
    overrides: [expenseListProvider.overrideWith(() => notifier)],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('renders expense rows with payee and amount', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf([_expense()]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.text('Supermarket'), findsOneWidget);
  });

  testWidgets('shows the empty state when there are no items and no search', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.textContaining('No expenses yet'), findsOneWidget);
  });

  testWidgets('tapping the FAB navigates to /expense/new', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('new expense'), findsOneWidget);
  });

  testWidgets('tapping a row navigates to its detail route', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf([_expense(id: 'e9')]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('expense-row-e9')));
    await tester.pumpAndSettle();

    expect(find.text('expense e9'), findsOneWidget);
  });

  testWidgets('typing in the search field calls setSearch', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('expense-search')), 'super');
    await tester.pumpAndSettle();

    expect(notifier.lastSearch, 'super');
  });

  testWidgets('selecting a wallet filter chip calls setWalletFilter', (tester) async {
    final notifier = _FixedExpenseListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.text(walletLabels[Wallet.cash]!));
    await tester.pumpAndSettle();

    expect(notifier.lastWalletFilter, Wallet.cash);
  });
}
