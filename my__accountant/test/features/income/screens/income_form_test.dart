import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart' as page_models;
import 'package:my__accountant/features/income/data/income_models.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_repository.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_form.dart';

class MockIncomeRepository extends Mock implements IncomeRepository {}

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

IncomeDetail _income({String? warning}) => IncomeDetail(
      id: 'i1',
      userId: 'u1',
      sourceId: 's1',
      sourceName: 'Salary',
      date: '2026-08-01',
      amount: '50000.00',
      notes: 'August pay',
      wallet: Wallet.account,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      distribution: const [
        IncomeSplit(
          id: 'd1',
          distributionCategoryId: 'dc1',
          categoryName: 'Essentials',
          amount: '30000.00',
          percentageApplied: '60',
        ),
      ],
      warning: warning,
    );

Widget _harness({
  required MockIncomeRepository repository,
  required MockIncomeSourceRepository sourceRepository,
  IncomeDetail? income,
}) {
  when(() => sourceRepository.list())
      .thenAnswer((_) async => const page_models.Page(data: [], pagination: page_models.PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)));

  return ProviderScope(
    overrides: [
      incomeRepositoryProvider.overrideWithValue(repository),
      incomeSourceRepositoryProvider.overrideWithValue(sourceRepository),
    ],
    child: MaterialApp(home: Scaffold(body: IncomeForm(income: income))),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(const IncomeInput(sourceId: null, date: '2026-08-01', amount: '1', notes: null, wallet: Wallet.cash));
  });

  testWidgets('create mode pre-fills today and defaults to the account wallet', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockIncomeRepository(),
      sourceRepository: MockIncomeSourceRepository(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Record income'), findsOneWidget);
    expect(find.text('None'), findsOneWidget); // no source selected
  });

  testWidgets('edit mode pre-fills the existing record and shows the split', (tester) async {
    await tester.pumpWidget(_harness(
      repository: MockIncomeRepository(),
      sourceRepository: MockIncomeSourceRepository(),
      income: _income(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Save changes'), findsOneWidget);
    expect(find.text('50000.00'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
    expect(find.text('Essentials'), findsOneWidget);
    expect(find.text('Delete income'), findsOneWidget);
  });

  testWidgets('shows a validation error and makes no network call for an empty amount', (tester) async {
    final repository = MockIncomeRepository();
    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    expect(find.text('Enter an amount.'), findsOneWidget);
    verifyNever(() => repository.createIncome(any()));
  });

  testWidgets('submitting a valid form calls createIncome with the entered amount', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.createIncome(any())).thenAnswer((_) async => _income());

    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '1500');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    final captured = verify(() => repository.createIncome(captureAny())).captured.single as IncomeInput;
    expect(captured.amount, '1500');
  });

  testWidgets('a save that returns a warning shows it in a dialog', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.createIncome(any()))
        .thenAnswer((_) async => _income(warning: 'Distribution percentages total 90%.'));

    await tester.pumpWidget(_harness(repository: repository, sourceRepository: MockIncomeSourceRepository()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('income-amount')), '1500');
    await tester.tap(find.text('Record income'));
    await tester.pumpAndSettle();

    expect(find.text('Distribution percentages total 90%.'), findsOneWidget);
  });

  testWidgets('confirming delete calls deleteIncome', (tester) async {
    final repository = MockIncomeRepository();
    when(() => repository.deleteIncome('i1')).thenAnswer((_) async {});

    await tester.pumpWidget(_harness(
      repository: repository,
      sourceRepository: MockIncomeSourceRepository(),
      income: _income(),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete income'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    verify(() => repository.deleteIncome('i1')).called(1);
  });
}
