import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/theme/app_theme.dart';
import 'package:my__accountant/core/theme/palette.dart';

void main() {
  test('light theme exposes the light palette via AppColors', () {
    final theme = buildAppTheme(Brightness.light);
    final colors = theme.extension<AppColors>()!.colors;
    expect(colors.primary, const Color(0xFF1E88E5));
    expect(colors.background, const Color(0xFFF8FAFC));
    expect(colors.brandWash, const Color(0xFFEFF6FE));
  });

  test('dark theme steps primary up to primaryLight for contrast', () {
    final theme = buildAppTheme(Brightness.dark);
    final colors = theme.extension<AppColors>()!.colors;
    expect(colors.primary, const Color(0xFF64B5F6));
    expect(colors.background, const Color(0xFF0B1220));
    expect(colors.brandWash, const Color(0xFF17263D));
  });

  test('brandFill is the true brand blue in both schemes', () {
    expect(lightColors.brandFill, const Color(0xFF1E88E5));
    expect(darkColors.brandFill, const Color(0xFF1E88E5));
  });

  test('allocation percentages sum to 100', () {
    final total = allocations.fold<int>(0, (sum, a) => sum + a.percentage);
    expect(total, 100);
  });

  test('allocation resolves to the right color per brightness', () {
    final essentials = allocations.firstWhere((a) => a.name == 'Essentials');
    expect(essentials.colorFor(Brightness.light), Brand.primary);
    expect(essentials.colorFor(Brightness.dark), Brand.primaryLight);
  });
}
