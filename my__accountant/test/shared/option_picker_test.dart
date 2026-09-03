import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/shared/named_record.dart';
import 'package:my__accountant/shared/option_picker.dart';

void main() {
  Widget harness(Future<void> Function(BuildContext context) onPressed) {
    return MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: ElevatedButton(
            onPressed: () => onPressed(context),
            child: const Text('Open'),
          ),
        ),
      ),
    );
  }

  testWidgets('selecting "none" returns a result with a null id', (tester) async {
    OptionPickerResult? result;
    await tester.pumpWidget(harness((context) async {
      result = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: 'a',
        noneLabel: 'None',
      );
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('None'));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!.id, isNull);
  });

  testWidgets('selecting an option returns its id', (tester) async {
    OptionPickerResult? result;
    await tester.pumpWidget(harness((context) async {
      result = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: null,
        noneLabel: 'None',
      );
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alpha'));
    await tester.pumpAndSettle();

    expect(result!.id, 'a');
  });

  testWidgets('dismissing without a choice does not signal a change', (tester) async {
    OptionPickerResult? result = const OptionPickerResult('unchanged');
    await tester.pumpWidget(harness((context) async {
      final picked = await showOptionPicker(
        context: context,
        title: 'Pick one',
        options: const [NamedRecord(id: 'a', name: 'Alpha')],
        selectedId: null,
        noneLabel: 'None',
      );
      if (picked != null) result = picked;
    }));

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    // Tap the scrim, outside the sheet, to dismiss without choosing.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(result!.id, 'unchanged');
  });
}
