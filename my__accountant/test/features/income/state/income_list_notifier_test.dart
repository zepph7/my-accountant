import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';
import 'package:my__accountant/features/income/state/income_list_notifier.dart';

class MockIncomeRepository extends Mock implements IncomeRepository {}

Income _income({String id = 'i1'}) => Income(
      id: id,
      userId: 'u1',
      sourceId: null,
      sourceName: null,
      date: '2026-08-01',
      amount: '100',
      notes: null,
      wallet: Wallet.cash,
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
    );

Page<Income> _page(List<Income> items) => Page(
      data: items,
      pagination: PaginationMeta(page: 1, limit: 20, total: items.length, totalPages: 1),
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  late MockIncomeRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = MockIncomeRepository();
    container = ProviderContainer(overrides: [incomeRepositoryProvider.overrideWithValue(repository)]);
    addTearDown(container.dispose);
  });

  test('fetches page 1 with no wallet filter by default', () async {
    when(() => repository.listIncomes(page: 1, wallet: null)).thenAnswer((_) async => _page([_income()]));

    container.read(incomeListProvider);
    await _settle();

    expect(container.read(incomeListProvider).items, hasLength(1));
    verify(() => repository.listIncomes(page: 1, wallet: null)).called(1);
  });

  test('setWalletFilter reloads with the given wallet', () async {
    when(() => repository.listIncomes(page: 1, wallet: null)).thenAnswer((_) async => _page([]));
    when(() => repository.listIncomes(page: 1, wallet: Wallet.mpesa))
        .thenAnswer((_) async => _page([_income(id: 'i2')]));

    container.read(incomeListProvider);
    await _settle();
    container.read(incomeListProvider.notifier).setWalletFilter(Wallet.mpesa);
    await _settle();

    expect(container.read(incomeListProvider).items.single.id, 'i2');
    verify(() => repository.listIncomes(page: 1, wallet: Wallet.mpesa)).called(1);
  });
}
