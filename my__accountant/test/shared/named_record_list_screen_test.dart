import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/named_record.dart';
import 'package:my__accountant/shared/named_record_list_screen.dart';

Widget _harness({
  required Future<List<NamedRecord>> Function() list,
  Future<NamedRecord> Function(String name)? create,
  Future<NamedRecord> Function(String id, String name)? rename,
  Future<void> Function(String id)? remove,
}) {
  return MaterialApp(
    home: NamedRecordListScreen(
      title: 'Income sources',
      noun: 'source',
      emptyBody: 'No sources yet.',
      deleteNote: 'Existing records keep this name.',
      list: list,
      create: create ?? (name) async => NamedRecord(id: 'new', name: name),
      rename: rename ?? (id, name) async => NamedRecord(id: id, name: name),
      remove: remove ?? (id) async {},
    ),
  );
}

void main() {
  testWidgets('shows the empty state when the list is empty', (tester) async {
    await tester.pumpWidget(_harness(list: () async => []));
    await tester.pumpAndSettle();

    expect(find.text('No sources yet.'), findsOneWidget);
  });

  testWidgets('renders each item by name', (tester) async {
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
    ));
    await tester.pumpAndSettle();

    expect(find.text('Salary'), findsOneWidget);
  });

  testWidgets('adding a new item calls create and reloads the list', (tester) async {
    var reloaded = false;
    Future<List<NamedRecord>> list() async =>
        reloaded ? const [NamedRecord(id: 's1', name: 'Freelance')] : const <NamedRecord>[];

    String? createdName;
    await tester.pumpWidget(_harness(
      list: list,
      create: (name) async {
        createdName = name;
        reloaded = true;
        return const NamedRecord(id: 's1', name: 'Freelance');
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Freelance');
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    expect(createdName, 'Freelance');
    expect(find.text('Freelance'), findsOneWidget);
  });

  testWidgets('renaming an item calls rename with its id', (tester) async {
    String? renamedId;
    String? renamedTo;
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
      rename: (id, name) async {
        renamedId = id;
        renamedTo = name;
        return NamedRecord(id: id, name: name);
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('named-record-name')), 'Salary (new job)');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(renamedId, 's1');
    expect(renamedTo, 'Salary (new job)');
  });

  testWidgets('removing an item after confirmation calls remove with its id', (tester) async {
    String? removedId;
    await tester.pumpWidget(_harness(
      list: () async => const [NamedRecord(id: 's1', name: 'Salary')],
      remove: (id) async => removedId = id,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();

    expect(removedId, 's1');
  });

  testWidgets('shows a validation error and does not call create for an empty name', (tester) async {
    var createCalled = false;
    await tester.pumpWidget(_harness(
      list: () async => const [],
      create: (name) async {
        createCalled = true;
        return NamedRecord(id: 'x', name: name);
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add source'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a name.'), findsOneWidget);
    expect(createCalled, isFalse);
  });
}
