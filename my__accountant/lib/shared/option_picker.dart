import 'package:flutter/material.dart';

import 'named_record.dart';

/// `null` means the sheet was dismissed without a choice — the caller must
/// not overwrite the current selection. A non-null result always carries a
/// decision: `id == null` means the user explicitly picked the "none" row.
class OptionPickerResult {
  const OptionPickerResult(this.id);
  final String? id;
}

Future<OptionPickerResult?> showOptionPicker({
  required BuildContext context,
  required String title,
  required List<NamedRecord> options,
  required String? selectedId,
  required String noneLabel,
}) {
  return showModalBottomSheet<OptionPickerResult>(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(title, style: Theme.of(context).textTheme.titleMedium),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  ListTile(
                    title: Text(noneLabel),
                    trailing: selectedId == null ? const Icon(Icons.check) : null,
                    onTap: () => Navigator.of(context).pop(const OptionPickerResult(null)),
                  ),
                  for (final option in options)
                    ListTile(
                      title: Text(option.name),
                      trailing: selectedId == option.id ? const Icon(Icons.check) : null,
                      onTap: () => Navigator.of(context).pop(OptionPickerResult(option.id)),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
