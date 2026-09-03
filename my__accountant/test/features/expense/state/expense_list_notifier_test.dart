import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/expense/data/expense_models.dart';
import 'package:my__accountant/features/expense/data/expense_providers.dart';
import 'package:my__accountant/features/expense/data/expense_repository.dart';
import 'package:my__accountant/features/expense/state/expense_list_notifier.dart';
import 'package:my__accountant/features/income/data/income_models.dart' show Wallet;

class MockExpenseRepository extends Mock implements ExpenseRepository {}

Expense _expense({String id = 'e1'}) => Expense(
      id: id,
      userId: 'u1',
      categoryId: null,
      categoryName: null,
      occurredAt: '2026-08-09T14:05:00Z',
      amount: '100',
      description: null,
      payee: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-09T14:05:00Z',
      updatedAt: '2026-08-09T14:05:00Z',
    );

Page<Expense> _page(List<Expense> items) => Page(
      data: items,
      pagination: PaginationMeta(page: 1, limit: 20, total: items.length, totalPages: 1),
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  late MockExpenseRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = MockExpenseRepository();
    container = ProviderContainer(overrides: [expenseRepositoryProvider.overrideWithValue(repository)]);
    addTearDown(container.dispose);
  });

  test('fetches page 1 with no filters by default', () async {
    when(() => repository.listExpenses(page: 1, wallet: null, search: null))
        .thenAnswer((_) async => _page([_expense()]));

    container.read(expenseListProvider);
    await _settle();

    expect(container.read(expenseListProvider).items, hasLength(1));
    verify(() => repository.listExpenses(page: 1, wallet: null, search: null)).called(1);
  });

  test('setSearch and setWalletFilter both reload with the combined filters', () async {
    when(() => repository.listExpenses(page: 1, wallet: null, search: null))
        .thenAnswer((_) async => _page([]));
    when(() => repository.listExpenses(page: 1, wallet: null, search: 'super'))
        .thenAnswer((_) async => _page([]));
    when(() => repository.listExpenses(page: 1, wallet: Wallet.mpesa, search: 'super'))
        .thenAnswer((_) async => _page([_expense(id: 'e2')]));

    container.read(expenseListProvider);
    await _settle();
    container.read(expenseListProvider.notifier).setSearch('super');
    await _settle();
    container.read(expenseListProvider.notifier).setWalletFilter(Wallet.mpesa);
    await _settle();

    expect(container.read(expenseListProvider).items.single.id, 'e2');
    verify(() => repository.listExpenses(page: 1, wallet: Wallet.mpesa, search: 'super')).called(1);
  });
}
