import 'package:flutter/material.dart';

import 'income_form.dart';

class IncomeCreateScreen extends StatelessWidget {
  const IncomeCreateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Record income')),
      body: const IncomeForm(),
    );
  }
}
