import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_validation.dart';
import '../state/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _remember = true;
  bool _submitting = false;
  String? _formError;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _identifierController.dispose();
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
      final credential = identifierCredential(_identifierController.text);
      await ref.read(authProvider.notifier).signInWithPassword(
            email: credential.email,
            phone: credential.phone,
            password: _passwordController.text,
            remember: _remember,
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

  Future<void> _continueWithGoogle() async {
    setState(() {
      _submitting = true;
      _formError = null;
    });
    try {
      await ref.read(authProvider.notifier).signInWithGoogle(remember: _remember);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = e.message);
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('My Accountant', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 24),
                  if (_formError != null) ...[
                    Text(_formError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    key: const Key('login-identifier'),
                    controller: _identifierController,
                    decoration: InputDecoration(
                      labelText: 'Email or phone number',
                      errorText: _fieldErrors['identifier'],
                    ),
                    validator: (v) => validateIdentifier(v ?? ''),
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('login-password'),
                    controller: _passwordController,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      errorText: _fieldErrors['password'],
                    ),
                    obscureText: true,
                    validator: (v) => validatePassword(v ?? ''),
                  ),
                  Row(
                    children: [
                      Checkbox(value: _remember, onChanged: (v) => setState(() => _remember = v ?? true)),
                      const Text('Remember me'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Sign in'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _submitting ? null : _continueWithGoogle,
                    child: const Text('Continue with Google'),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => context.go('/register'),
                    child: const Text("Don't have an account? Register"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
