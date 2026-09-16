import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:reaprime/src/models/device/sensor.dart';
import 'package:reaprime/src/plugins/plugin_ble_registry.dart';
import 'package:reaprime/src/plugins/plugin_manager.dart';
import 'package:reaprime/src/plugins/plugin_manifest.dart';

import '../helpers/crystal_plugin_fixture.dart';
import 'plugin_test_helpers.dart';

BleAdvertisementEvidence crystalEvidence() =>
    BleAdvertisementEvidence(name: 'CRYSTAL-E538');

Future<Sensor> createCrystalSensor(
  PluginManager manager,
  CrystalPluginTransport transport, {
  BleAdvertisementEvidence? evidence,
}) async {
  final resolved = evidence ?? crystalEvidence();
  return await manager.bleService.createCandidate(
        driver: manager.bleService.registry.decide(resolved).drivers.single,
        physicalId: 'AA:BB',
        evidence: resolved,
        admit: () => true,
        createTransport: () => transport,
      )
      as Sensor;
}

Future<Sensor> connectCrystal(
  PluginManager manager,
  CrystalPluginTransport transport,
) async {
  final sensor = await createCrystalSensor(manager, transport);
  await sensor.onConnect();
  return sensor;
}

Future<Map<String, dynamic>> pluginHttp(
  PluginManager manager, {
  String method = 'GET',
  Map<String, String> query = const {},
  Object? body,
}) async {
  final requestId = 'req-${DateTime.now().microsecondsSinceEpoch}';
  final response = manager.registerPendingHttp(crystalManifest().id, requestId);
  manager.dispatchEvent(crystalManifest().id, 'httpRequest', {
    'requestId': requestId,
    'endpoint': 'ui',
    'method': method,
    'headers': <String, String>{},
    'body': body,
    'query': query,
  });
  return response;
}

void main() {
  test('CRYSTAL manifest declares a sensor driver matched by name alone', () {
    final driver = crystalManifest().drivers.single;
    expect(driver.id, 'crystal');
    expect(driver.type, PluginDriverType.sensor);
    // The device advertises no service UUIDs, so a serviceUuids constraint
    // would never match.
    expect(driver.ble!.serviceUuids, isNull);
    expect(driver.ble!.nameValue, 'crystal');
  });

  test('CRYSTAL advertisement without the name is not claimed', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final decision = manager.bleService.registry.decide(
      BleAdvertisementEvidence(name: 'ACME GRINDER'),
    );
    expect(decision.drivers, isEmpty);
  });

  test(
    'CRYSTAL connect subscribes every channel and reads their values',
    () async {
      final manager = PluginManager(kvStore: FakeKeyValueStoreService());
      addTearDown(manager.dispose);
      await loadCrystalPlugin(manager);
      final transport = CrystalPluginTransport(
        'AA:BB',
        initial: {'servoAngle': 499},
      );
      final sensor = await connectCrystal(manager, transport);
      expect(transport.discoverServicesCalls, 1);
      expect(transport.subscribedChannels, hasLength(5));
      final values = await sensor.execute(
        'getValues',
        const <String, dynamic>{},
      );
      expect(values['servoAngle'], 499);
      expect(values['motorRpm'], 0);
      await sensor.disconnect();
    },
  );

  test('CRYSTAL decodes values as big-endian UInt16', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    // 499 on the wire is 0x01 0xF3; little-endian would give 62209.
    expect(crystalBytes(499), [0x01, 0xF3]);
    final transport = CrystalPluginTransport(
      'AA:BB',
      initial: {'servoAngle': 499},
    );
    final sensor = await connectCrystal(manager, transport);
    final values = await sensor.execute('getValues', const <String, dynamic>{});
    expect(values['servoAngle'], 499);
    expect(values['servoAngle'], isNot(62209));
    await sensor.disconnect();
  });

  test('CRYSTAL writes motor RPM as two big-endian bytes', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final transport = CrystalPluginTransport('AA:BB');
    final sensor = await connectCrystal(manager, transport);
    await sensor.execute('writeMotorRpm', const {'value': 1000});
    expect(transport.writesTo('motorRpm'), [
      [0x03, 0xE8],
    ]);
    await sensor.disconnect();
  });

  test('CRYSTAL setAndApply writes the target then syncs it', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final transport = CrystalPluginTransport('AA:BB');
    final sensor = await connectCrystal(manager, transport);
    await sensor.execute('setAndApply', const {'value': 650});
    expect(transport.writesTo('targetAngle'), [
      [0x02, 0x8A],
    ]);
    expect(transport.writesTo('bootSign'), [
      [0x00, 0x05],
    ]);
    await sensor.disconnect();
  });

  test('CRYSTAL notifications update the published snapshot', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final transport = CrystalPluginTransport('AA:BB');
    final sensor = await createCrystalSensor(manager, transport);
    final samples = <Map<String, dynamic>>[];
    final subscription = sensor.data.listen(samples.add);
    addTearDown(subscription.cancel);
    await sensor.onConnect();
    samples.clear();
    transport.notify('servoAngle', 720);
    final deadline = DateTime.now().add(const Duration(seconds: 2));
    while (samples.isEmpty && DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(samples, isNotEmpty);
    expect(samples.last['servoAngle'], 720);
    await sensor.disconnect();
  });

  test('CRYSTAL HTTP handler serves the control page', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final response = await pluginHttp(manager);
    expect(response['status'], 200);
    final page = response['body'] as String;
    expect(page, contains('id="servoAngle"'));
    expect(page, contains('id="apply"'));
  });

  test(
    'CRYSTAL HTTP state reports values without re-reading the device',
    () async {
      final manager = PluginManager(kvStore: FakeKeyValueStoreService());
      addTearDown(manager.dispose);
      await loadCrystalPlugin(manager);
      final transport = CrystalPluginTransport(
        'AA:BB',
        initial: {'servoAngle': 500},
      );
      final sensor = await connectCrystal(manager, transport);
      transport.writes.clear();
      final response = await pluginHttp(manager, query: const {'state': '1'});
      final state =
          jsonDecode(response['body'] as String) as Map<String, dynamic>;
      expect(state['connected'], isTrue);
      expect((state['values'] as Map)['servoAngle'], 500);
      expect(transport.writes, isEmpty);
      await sensor.disconnect();
    },
  );

  test('CRYSTAL HTTP POST routes through the same command surface', () async {
    final manager = PluginManager(kvStore: FakeKeyValueStoreService());
    addTearDown(manager.dispose);
    await loadCrystalPlugin(manager);
    final transport = CrystalPluginTransport('AA:BB');
    final sensor = await connectCrystal(manager, transport);
    final response = await pluginHttp(
      manager,
      method: 'POST',
      body: const {
        'commandId': 'writeFeedRpm',
        'params': {'value': 30},
      },
    );
    final payload =
        jsonDecode(response['body'] as String) as Map<String, dynamic>;
    expect(payload['ok'], isTrue);
    expect(transport.writesTo('feedRpm'), [
      [0x00, 0x1E],
    ]);
    await sensor.disconnect();
  });
}
