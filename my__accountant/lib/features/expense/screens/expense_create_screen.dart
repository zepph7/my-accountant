import 'package:flutter/material.dart';

import 'expense_form.dart';

class ExpenseCreateScreen extends StatelessWidget {
  const ExpenseCreateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Record expense')),
      body: const ExpenseForm(),
    );
  }
}
