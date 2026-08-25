import '../../income/data/income_models.dart' show Wallet;

/// Expenses carry a full timestamp, not just a date — that is what makes
/// the hourly spending report (a later plan) real.
class Expense {
  const Expense({
    required this.id,
    required this.userId,
    required this.categoryId,
    required this.categoryName,
    required this.occurredAt,
    required this.amount,
    required this.description,
    required this.payee,
    required this.wallet,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String? categoryId;
  final String? categoryName;
  final String occurredAt;
  final String amount;
  final String? description;
  final String? payee;
  final Wallet wallet;
  final String createdAt;
  final String updatedAt;

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        categoryId: json['category_id'] as String?,
        categoryName: json['category_name'] as String?,
        occurredAt: json['occurred_at'] as String,
        amount: json['amount'] as String,
        description: json['description'] as String?,
        payee: json['payee'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
      );
}

class ExpenseInput {
  const ExpenseInput({
    required this.categoryId,
    required this.occurredAt,
    required this.amount,
    required this.payee,
    required this.description,
    required this.wallet,
  });

  final String? categoryId;
  final String occurredAt;
  final String amount;
  final String? payee;
  final String? description;
  final Wallet wallet;

  Map<String, dynamic> toJson() => {
        'categoryId': categoryId,
        'occurredAt': occurredAt,
        'amount': amount,
        'payee': payee,
        'description': description,
        'wallet': wallet.value,
      };
}
