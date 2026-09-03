import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/screens/income_list_screen.dart';
import 'package:my__accountant/features/income/state/income_list_notifier.dart';
import 'package:my__accountant/shared/paged_list.dart';

class _FixedIncomeListNotifier extends IncomeListNotifier {
  _FixedIncomeListNotifier(this._state);
  final PagedListState<Income> _state;
  Wallet? lastWalletFilter;

  @override
  PagedListState<Income> build() => _state;

  @override
  void setWalletFilter(Wallet? wallet) {
    lastWalletFilter = wallet;
  }
}

Income _income({String id = 'i1', String? sourceName = 'Salary'}) => Income(
      id: id,
      userId: 'u1',
      sourceId: null,
      sourceName: sourceName,
      date: '2026-08-01',
      amount: '50000.00',
      notes: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
    );

PagedListState<Income> _stateOf(List<Income> items, {bool loading = false}) => PagedListState<Income>(
      items: items,
      total: items.length,
      page: 1,
      totalPages: 1,
      error: null,
      loading: loading,
      refreshing: false,
      loadingMore: false,
    );

Widget _harness(_FixedIncomeListNotifier notifier) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const IncomeListScreen()),
    GoRoute(path: '/income/new', builder: (context, state) => const Scaffold(body: Text('new income'))),
    GoRoute(
      path: '/income/:id',
      builder: (context, state) => Scaffold(body: Text('income ${state.pathParameters['id']}')),
    ),
  ]);

  return ProviderScope(
    overrides: [incomeListProvider.overrideWith(() => notifier)],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('renders income rows with source name and amount', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf([_income()]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('shows a spinner while loading', (tester) async {
    final notifier = _FixedIncomeListNotifier(PagedListState.initial<Income>());
    await tester.pumpWidget(_harness(notifier));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });

  testWidgets('shows the empty state when there are no items', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    expect(find.textContaining('No income yet'), findsOneWidget);
  });

  testWidgets('tapping the FAB navigates to /income/new', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    expect(find.text('new income'), findsOneWidget);
  });

  testWidgets('tapping a row navigates to its detail route', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf([_income(id: 'i9')]));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('income-row-i9')));
    await tester.pumpAndSettle();

    expect(find.text('income i9'), findsOneWidget);
  });

  testWidgets('selecting a wallet filter chip calls setWalletFilter', (tester) async {
    final notifier = _FixedIncomeListNotifier(_stateOf(const []));
    await tester.pumpWidget(_harness(notifier));
    await tester.pumpAndSettle();

    await tester.tap(find.text(walletLabels[Wallet.mpesa]!));
    await tester.pumpAndSettle();

    expect(notifier.lastWalletFilter, Wallet.mpesa);
  });
}
