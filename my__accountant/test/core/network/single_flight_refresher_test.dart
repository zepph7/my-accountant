import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:my__accountant/core/network/single_flight_refresher.dart';

void main() {
  test('concurrent callers share one in-flight action', () async {
    var callCount = 0;
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      callCount++;
      await Future<void>.delayed(const Duration(milliseconds: 10));
      return 42;
    }

    final results = await Future.wait([
      refresher.run(action),
      refresher.run(action),
      refresher.run(action),
    ]);

    expect(callCount, 1);
    expect(results, [42, 42, 42]);
  });

  test('a later call after completion starts a new action', () async {
    var callCount = 0;
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      callCount++;
      return callCount;
    }

    final first = await refresher.run(action);
    final second = await refresher.run(action);

    expect(first, 1);
    expect(second, 2);
  });

  test('propagates the action\'s error to every waiting caller', () async {
    final refresher = SingleFlightRefresher<int>();

    Future<int> action() async {
      await Future<void>.delayed(const Duration(milliseconds: 5));
      throw StateError('boom');
    }

    final calls = [refresher.run(action), refresher.run(action)];

    for (final call in calls) {
      await expectLater(call, throwsA(isA<StateError>()));
    }
  });
}
