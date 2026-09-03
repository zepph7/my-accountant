import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my__accountant/core/network/page.dart';
import 'package:my__accountant/features/income/data/income_providers.dart';
import 'package:my__accountant/features/income/data/income_source_repository.dart';
import 'package:my__accountant/features/income/screens/income_sources_screen.dart';
import 'package:my__accountant/shared/named_record.dart';

class MockIncomeSourceRepository extends Mock implements IncomeSourceRepository {}

void main() {
  testWidgets('renders the "Income sources" title and lists sources', (tester) async {
    final repository = MockIncomeSourceRepository();
    when(() => repository.list()).thenAnswer((_) async => const Page(
          data: [NamedRecord(id: 's1', name: 'Salary')],
          pagination: PaginationMeta(page: 1, limit: 100, total: 1, totalPages: 1),
        ));

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: IncomeSourcesScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Income sources'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('adding a source calls repository.create', (tester) async {
    final repository = MockIncomeSourceRepository();
    when(() => repository.list()).thenAnswer(
      (_) async => const Page(data: [], pagination: PaginationMeta(page: 1, limit: 100, total: 0, totalPages: 0)),
    );
    when(() => repository.create('Freelance'))
        .thenAnswer((_) async => const NamedRecord(id: 's2', name: 'Freelance'));

    await tester.pumpWidget(ProviderScope(
      overrides: [incomeSourceRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(home: IncomeSourcesScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Freelance');
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    verify(() => repository.create('Freelance')).called(1);
  });
}
