// my__accountant/lib/core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/profile_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/auth/state/auth_provider.dart';
import '../../features/auth/state/auth_state.dart';

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title — coming soon')),
    );
  }
}

const _tabPaths = ['/', '/income', '/expenses', '/reports', '/settings'];

class _TabShell extends StatelessWidget {
  const _TabShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _tabPaths.indexWhere(
      (tab) => location == tab || (tab == '/settings' && location.startsWith('/settings/')),
    );

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) => context.go(_tabPaths[i]),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.arrow_downward), label: 'Income'),
          NavigationDestination(icon: Icon(Icons.arrow_upward), label: 'Expenses'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, __) => refreshNotifier.value++);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final onAuthRoute = state.matchedLocation == '/login' || state.matchedLocation == '/register';

      if (auth.status == AuthStatus.loading) return null;
      if (auth.status == AuthStatus.unauthenticated) {
        return onAuthRoute ? null : '/login';
      }
      return onAuthRoute ? '/' : null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      ShellRoute(
        builder: (context, state, child) => _TabShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const ComingSoonScreen('Home')),
          GoRoute(path: '/income', builder: (context, state) => const ComingSoonScreen('Income')),
          GoRoute(
            path: '/expenses',
            builder: (context, state) => const ComingSoonScreen('Expenses'),
          ),
          GoRoute(path: '/reports', builder: (context, state) => const ComingSoonScreen('Reports')),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const ComingSoonScreen('Settings'),
            routes: [
              GoRoute(
                path: 'profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
