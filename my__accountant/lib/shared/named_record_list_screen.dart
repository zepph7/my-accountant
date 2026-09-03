import 'package:flutter/material.dart';

import '../core/network/api_exception.dart';
import 'money_validation.dart';
import 'named_record.dart';

/// Income sources and expense categories are the same shape of screen —
/// both are a user-owned list of names with create, rename and delete.
/// Writing this once means the two cannot drift into behaving differently.
/// Mirrors `NameListScreen` in `components/forms/name-list.tsx`.
class NamedRecordListScreen extends StatefulWidget {
  const NamedRecordListScreen({
    super.key,
    required this.title,
    required this.noun,
    required this.emptyBody,
    required this.deleteNote,
    required this.list,
    required this.create,
    required this.rename,
    required this.remove,
  });

  final String title;

  /// Lower-case singular, used in messages: "source", "category".
  final String noun;
  final String emptyBody;

  /// What happens to existing records when one is removed.
  final String deleteNote;

  final Future<List<NamedRecord>> Function() list;
  final Future<NamedRecord> Function(String name) create;
  final Future<NamedRecord> Function(String id, String name) rename;
  final Future<void> Function(String id) remove;

  @override
  State<NamedRecordListScreen> createState() => _NamedRecordListScreenState();
}

class _NamedRecordListScreenState extends State<NamedRecordListScreen> {
  late Future<List<NamedRecord>> _future;
  NamedRecord? _editing;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _future = widget.list();
  }

  void _reload() {
    setState(() {
      _future = widget.list();
      _editing = null;
      _adding = false;
    });
  }

  Future<void> _confirmRemove(NamedRecord item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Remove ${item.name}?'),
        content: Text(widget.deleteNote),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await widget.remove(item.id);
      if (!mounted) return;
      _reload();
    } catch (cause) {
      if (!mounted) return;
      final message = cause is ApiException ? cause.message : 'Try again in a moment.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not remove this ${widget.noun}: $message')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() {
          _adding = true;
          _editing = null;
        }),
        child: const Icon(Icons.add),
      ),
      body: FutureBuilder<List<NamedRecord>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Could not load this list.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _reload, child: const Text('Retry')),
                  ],
                ),
              ),
            );
          }

          final items = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(widget.emptyBody, textAlign: TextAlign.center),
                )
              else
                for (final item in items)
                  ListTile(
                    key: Key('named-record-${item.id}'),
                    title: Text(item.name),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          tooltip: 'Rename ${item.name}',
                          onPressed: () => setState(() {
                            _editing = item;
                            _adding = false;
                          }),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline),
                          tooltip: 'Remove ${item.name}',
                          onPressed: () => _confirmRemove(item),
                        ),
                      ],
                    ),
                  ),
              if (_adding || _editing != null)
                _NameEditor(
                  noun: widget.noun,
                  record: _editing,
                  save: (name) =>
                      _editing != null ? widget.rename(_editing!.id, name) : widget.create(name),
                  onDone: _reload,
                  onCancel: () => setState(() {
                    _adding = false;
                    _editing = null;
                  }),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _NameEditor extends StatefulWidget {
  const _NameEditor({
    required this.noun,
    required this.record,
    required this.save,
    required this.onDone,
    required this.onCancel,
  });

  final String noun;
  final NamedRecord? record;
  final Future<NamedRecord> Function(String name) save;
  final VoidCallback onDone;
  final VoidCallback onCancel;

  @override
  State<_NameEditor> createState() => _NameEditorState();
}

class _NameEditorState extends State<_NameEditor> {
  late final TextEditingController _controller;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.record?.name ?? '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final invalid = validateLabel(_controller.text, 'name');
    setState(() => _error = invalid);
    if (invalid != null) return;

    setState(() => _submitting = true);
    try {
      await widget.save(_controller.text.trim());
      widget.onDone();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors['name'] ?? e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not save this ${widget.noun}. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.record != null ? 'Rename ${widget.record!.name}' : 'New ${widget.noun}'),
          const SizedBox(height: 8),
          TextField(
            key: const Key('named-record-name'),
            controller: _controller,
            decoration: InputDecoration(labelText: 'Name', errorText: _error),
            autofocus: widget.record == null,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(widget.record != null ? 'Save' : 'Add ${widget.noun}'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _submitting ? null : widget.onCancel,
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
