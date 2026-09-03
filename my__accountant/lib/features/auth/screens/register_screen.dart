import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_validation.dart';
import '../state/auth_provider.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _emailController.dispose();
    _phoneController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _formError = null;
      _fieldErrors = {};
    });
    try {
      await ref.read(authProvider.notifier).signUpWithPassword(
            email: _emailController.text.trim(),
            phone: normalizePhone(_phoneController.text),
            password: _passwordController.text,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            remember: true,
          );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _formError = e.fieldErrors.isEmpty ? e.message : null;
        _fieldErrors = e.fieldErrors;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _formError = 'Something went wrong. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
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
                  key: const Key('register-email'),
                  controller: _emailController,
                  decoration: InputDecoration(labelText: 'Email', errorText: _fieldErrors['email']),
                  validator: (v) => validateEmail(v ?? ''),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-phone'),
                  controller: _phoneController,
                  decoration: InputDecoration(labelText: 'Phone number', errorText: _fieldErrors['phone']),
                  validator: (v) => validatePhone(v ?? ''),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-first-name'),
                  controller: _firstNameController,
                  decoration: InputDecoration(
                    labelText: 'First name',
                    errorText: _fieldErrors['firstName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'first name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-last-name'),
                  controller: _lastNameController,
                  decoration: InputDecoration(
                    labelText: 'Last name',
                    errorText: _fieldErrors['lastName'],
                  ),
                  validator: (v) => validateName(v ?? '', 'last name'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('register-password'),
                  controller: _passwordController,
                  decoration:
                      InputDecoration(labelText: 'Password', errorText: _fieldErrors['password']),
                  obscureText: true,
                  validator: (v) => validatePassword(v ?? ''),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Create account'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Already have an account? Sign in'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
