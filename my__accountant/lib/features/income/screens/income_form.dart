import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/page.dart' as page_models;
import '../../../shared/format.dart';
import '../../../shared/money_validation.dart';
import '../../../shared/named_record.dart';
import '../../../shared/option_picker.dart';
import '../data/income_models.dart';
import '../data/income_providers.dart';
import '../state/income_list_notifier.dart';

class IncomeForm extends ConsumerStatefulWidget {
  const IncomeForm({super.key, this.income});

  final IncomeDetail? income;

  @override
  ConsumerState<IncomeForm> createState() => _IncomeFormState();
}

class _IncomeFormState extends ConsumerState<IncomeForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amountController;
  late final TextEditingController _notesController;
  late String _date;
  String? _sourceId;
  String? _sourceName;
  late Wallet _wallet;

  bool _submitting = false;
  bool _deleting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  late final Future<page_models.Page<NamedRecord>> _sourcesFuture;

  bool get _editing => widget.income != null;

  @override
  void initState() {
    super.initState();
    final income = widget.income;
    _amountController = TextEditingController(text: income?.amount ?? '');
    _notesController = TextEditingController(text: income?.notes ?? '');
    _date = income?.date.substring(0, 10) ?? today();
    _sourceId = income?.sourceId;
    _sourceName = income?.sourceName;
    _wallet = income?.wallet ?? Wallet.account;
    _sourcesFuture = ref.read(incomeSourceRepositoryProvider).list();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickSource() async {
    final page = await _sourcesFuture;
    if (!mounted) return;
    final result = await showOptionPicker(
      context: context,
      title: 'Income source',
      options: page.data,
      selectedId: _sourceId,
      noneLabel: 'No source',
    );
    if (result == null || !mounted) return;
    setState(() {
      _sourceId = result.id;
      _sourceName = result.id == null ? null : page.data.firstWhere((s) => s.id == result.id).name;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });

    try {
      final input = IncomeInput(
        sourceId: _sourceId,
        date: _date,
        amount: normalizeAmount(_amountController.text),
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
        wallet: _wallet,
      );

      final repository = ref.read(incomeRepositoryProvider);
      final saved = _editing
          ? await repository.updateIncome(widget.income!.id, input)
          : await repository.createIncome(input);

      ref.invalidate(incomeListProvider);
      if (!mounted) return;

      if (saved.warning != null) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Recorded, with a caveat'),
            content: Text(saved.warning!),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not save this income. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this income?'),
        content: const Text('Its split is removed with it, so your reports stay consistent.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ref.read(incomeRepositoryProvider).deleteIncome(widget.income!.id);
      ref.invalidate(incomeListProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not delete this income.');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_formError != null) ...[
              Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 12),
            ],
            TextFormField(
              key: const Key('income-amount'),
              controller: _amountController,
              decoration: InputDecoration(
                labelText: 'Amount ($currencyCode)',
                errorText: _fieldErrors['amount'],
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) => validateAmount(v ?? ''),
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('income-date'),
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Date received'),
                child: Text(longDate(_date)),
              ),
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('income-source'),
              onTap: _pickSource,
              child: InputDecorator(
                decoration: InputDecoration(labelText: 'Source', errorText: _fieldErrors['sourceId']),
                child: Text(_sourceName ?? 'None'),
              ),
            ),
            const SizedBox(height: 12),
            Text('Received into', style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final wallet in Wallet.values)
                  ChoiceChip(
                    label: Text(walletLabels[wallet]!),
                    selected: _wallet == wallet,
                    onSelected: (_) => setState(() => _wallet = wallet),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('income-notes'),
              controller: _notesController,
              decoration: InputDecoration(labelText: 'Notes', errorText: _fieldErrors['notes']),
              maxLines: 3,
              maxLength: 1000,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting || _deleting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_editing ? 'Save changes' : 'Record income'),
            ),
            if (_editing) ...[
              const SizedBox(height: 24),
              Text('How this was split', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              if (widget.income!.distribution.isEmpty)
                const Text(
                  'This income was recorded before any categories existed, so none of it was split.',
                )
              else
                for (final split in widget.income!.distribution)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(split.categoryName),
                        Text('${currency(split.amount)} (${percent(split.percentageApplied)})'),
                      ],
                    ),
                  ),
              const SizedBox(height: 16),
              OutlinedButton(
                key: const Key('income-delete'),
                onPressed: _submitting || _deleting ? null : _confirmDelete,
                child: Text(_deleting ? 'Deleting…' : 'Delete income'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
