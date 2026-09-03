
/// Mirrors the `Wallet` union in `lib/endpoints.ts`.
enum Wallet {
  cash,
  account,
  mpesa;

  String get value => name;

  static Wallet fromWire(String value) => Wallet.values.firstWhere((w) => w.name == value);
}

const walletLabels = <Wallet, String>{
  Wallet.cash: 'Cash',
  Wallet.account: 'Bank account',
  Wallet.mpesa: 'M-Pesa',
};

class Income {
  const Income({
    required this.id,
    required this.userId,
    required this.sourceId,
    required this.sourceName,
    required this.date,
    required this.amount,
    required this.notes,
    required this.wallet,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String? sourceId;
  final String? sourceName;
  final String date;
  final String amount;
  final String? notes;
  final Wallet wallet;
  final String createdAt;
  final String updatedAt;

  factory Income.fromJson(Map<String, dynamic> json) => Income(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        sourceId: json['source_id'] as String?,
        sourceName: json['source_name'] as String?,
        date: json['date'] as String,
        amount: json['amount'] as String,
        notes: json['notes'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
      );
}

class IncomeSplit {
  const IncomeSplit({
    required this.id,
    required this.distributionCategoryId,
    required this.categoryName,
    required this.amount,
    required this.percentageApplied,
  });

  final String id;
  final String distributionCategoryId;
  final String categoryName;
  final String amount;
  final String percentageApplied;

  factory IncomeSplit.fromJson(Map<String, dynamic> json) => IncomeSplit(
        id: json['id'] as String,
        distributionCategoryId: json['distribution_category_id'] as String,
        categoryName: json['category_name'] as String,
        amount: json['amount'] as String,
        percentageApplied: json['percentage_applied'] as String,
      );
}

/// The `warning` field is present when the configured distribution
/// percentages do not total 100 — the record still saved, this reports
/// what actually happened to the money.
class IncomeDetail extends Income {
  const IncomeDetail({
    required super.id,
    required super.userId,
    required super.sourceId,
    required super.sourceName,
    required super.date,
    required super.amount,
    required super.notes,
    required super.wallet,
    required super.createdAt,
    required super.updatedAt,
    required this.distribution,
    this.warning,
  });

  final List<IncomeSplit> distribution;
  final String? warning;

  factory IncomeDetail.fromJson(Map<String, dynamic> json) => IncomeDetail(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        sourceId: json['source_id'] as String?,
        sourceName: json['source_name'] as String?,
        date: json['date'] as String,
        amount: json['amount'] as String,
        notes: json['notes'] as String?,
        wallet: Wallet.fromWire(json['wallet'] as String),
        createdAt: json['created_at'] as String,
        updatedAt: json['updated_at'] as String,
        distribution: (json['distribution'] as List<dynamic>)
            .map((e) => IncomeSplit.fromJson(e as Map<String, dynamic>))
            .toList(),
        warning: json['warning'] as String?,
      );
}

/// The form that produces this always supplies every field (even when
/// clearing one to null), so — unlike a partial PATCH type — nothing here
/// is optional-and-omittable.
class IncomeInput {
  const IncomeInput({
    required this.sourceId,
    required this.date,
    required this.amount,
    required this.notes,
    required this.wallet,
  });

  final String? sourceId;
  final String date;
  final String amount;
  final String? notes;
  final Wallet wallet;

  Map<String, dynamic> toJson() => {
        'sourceId': sourceId,
        'date': date,
        'amount': amount,
        'notes': notes,
        'wallet': wallet.value,
      };
}
