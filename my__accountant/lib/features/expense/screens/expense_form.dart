import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/page.dart' as page_models;
import '../../../shared/format.dart';
import '../../../shared/money_validation.dart';
import '../../../shared/named_record.dart';
import '../../../shared/option_picker.dart';
import '../../income/data/income_models.dart' show Wallet, walletLabels;
import '../data/expense_models.dart';
import '../data/expense_providers.dart';
import '../state/expense_list_notifier.dart';

class ExpenseForm extends ConsumerStatefulWidget {
  const ExpenseForm({super.key, this.expense});

  final Expense? expense;

  @override
  ConsumerState<ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends ConsumerState<ExpenseForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amountController;
  late final TextEditingController _payeeController;
  late final TextEditingController _descriptionController;
  late String _occurredAt;
  String? _categoryId;
  String? _categoryName;
  late Wallet _wallet;

  bool _submitting = false;
  bool _deleting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  late final Future<page_models.Page<NamedRecord>> _categoriesFuture;

  bool get _editing => widget.expense != null;

  @override
  void initState() {
    super.initState();
    final expense = widget.expense;
    _amountController = TextEditingController(text: expense?.amount ?? '');
    _payeeController = TextEditingController(text: expense?.payee ?? '');
    _descriptionController = TextEditingController(text: expense?.description ?? '');
    _occurredAt = expense?.occurredAt ?? DateTime.now().toUtc().toIso8601String();
    _categoryId = expense?.categoryId;
    _categoryName = expense?.categoryName;
    _wallet = expense?.wallet ?? Wallet.account;
    _categoriesFuture = ref.read(expenseCategoryRepositoryProvider).list();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _payeeController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final current = DateTime.tryParse(_occurredAt)?.toLocal() ?? DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(current));
    if (time == null || !mounted) return;
    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() => _occurredAt = combined.toUtc().toIso8601String());
  }

  Future<void> _pickCategory() async {
    final page = await _categoriesFuture;
    if (!mounted) return;
    final result = await showOptionPicker(
      context: context,
      title: 'Expense category',
      options: page.data,
      selectedId: _categoryId,
      noneLabel: 'Uncategorised',
    );
    if (result == null || !mounted) return;
    setState(() {
      _categoryId = result.id;
      _categoryName = result.id == null ? null : page.data.firstWhere((c) => c.id == result.id).name;
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
      final input = ExpenseInput(
        categoryId: _categoryId,
        occurredAt: _occurredAt,
        amount: normalizeAmount(_amountController.text),
        payee: _payeeController.text.trim().isEmpty ? null : _payeeController.text.trim(),
        description:
            _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        wallet: _wallet,
      );

      final repository = ref.read(expenseRepositoryProvider);
      if (_editing) {
        await repository.updateExpense(widget.expense!.id, input);
      } else {
        await repository.createExpense(input);
      }

      ref.invalidate(expenseListProvider);
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
      setState(() => _formError = 'Could not save this expense. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this expense?'),
        content: const Text('It is removed from every report it appears in.'),
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
      await ref.read(expenseRepositoryProvider).deleteExpense(widget.expense!.id);
      ref.invalidate(expenseListProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Could not delete this expense.');
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
              key: const Key('expense-amount'),
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
              key: const Key('expense-datetime'),
              onTap: _pickDateTime,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'When'),
                child: Text(dateTime(_occurredAt)),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('expense-payee'),
              controller: _payeeController,
              decoration: InputDecoration(labelText: 'Paid to', errorText: _fieldErrors['payee']),
              maxLength: 255,
            ),
            const SizedBox(height: 12),
            InkWell(
              key: const Key('expense-category'),
              onTap: _pickCategory,
              child: InputDecorator(
                decoration:
                    InputDecoration(labelText: 'Category', errorText: _fieldErrors['categoryId']),
                child: Text(_categoryName ?? 'Uncategorised'),
              ),
            ),
            const SizedBox(height: 12),
            Text('Paid from', style: Theme.of(context).textTheme.labelMedium),
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
              key: const Key('expense-description'),
              controller: _descriptionController,
              decoration:
                  InputDecoration(labelText: 'Description', errorText: _fieldErrors['description']),
              maxLines: 3,
              maxLength: 1000,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting || _deleting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_editing ? 'Save changes' : 'Record expense'),
            ),
            if (_editing) ...[
              const SizedBox(height: 16),
              OutlinedButton(
                key: const Key('expense-delete'),
                onPressed: _submitting || _deleting ? null : _confirmDelete,
                child: Text(_deleting ? 'Deleting…' : 'Delete expense'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
