# CRYSTAL Grinder for Decaid

A [Decaid](https://github.com/decentespresso/decaid) plugin that adds the
CRYSTAL grinder. The plugin owns the device protocol; Decaid owns discovery, the
BLE connection lifecycle, and the device surface.

No Decaid release is needed to use this, and none is needed to add support for
another device.

## Why this is a Sensor, not a Grinder

Decaid has no grinder driver type yet, so this driver declares
`"type": "sensor"`. That is a lossless mapping rather than a workaround: the
Sensor surface carries arbitrary named data channels, so all five
characteristics are exposed without inventing a weight to satisfy the Scale
contract.

## Install

From the Decaid REST API, which installs the repository's latest release:

```bash
curl -X POST http://localhost:8080/api/v1/plugins/install/github-release \
  -H 'content-type: application/json' \
  -d '{"repo": "Sofronio/decaid-crystal"}'
```

Or open the Plugins settings screen in Decaid and install from the repository.

The public device ID is `plugin:crystal.reaplugin:crystal:<physical id>`. When
the plugin is loaded it takes ownership of the advertisement.

## Matching

An advertisement whose name contains `crystal` (case-insensitive), which the
device sends as `CRYSTAL-` plus the last four MAC digits (for example
`CRYSTAL-E538`). The matcher deliberately declares **no** service UUIDs: a scan
of a physical unit shows it advertises no service list at all, so a
`serviceUuids` constraint would never match.

## Protocol

Service `7fa2d10c-12f3-4b9e-9d77-1a9b65432100`. The five characteristics are the
same UUID with the final two digits replaced by the channel number:

| Channel | UUID suffix | Name | Access | Range |
| --- | --- | --- | --- | --- |
| `motorRpm` | `…01` | Motor RPM | read/write/notify | 0–1500 |
| `feedRpm` | `…02` | Feed RPM | read/write/notify | 0–150 |
| `bootSign` | `…03` | Boot sign | read/write/notify | 0–10 |
| `servoAngle` | `…05` | Current grind size | read/notify | 0–1500 |
| `targetAngle` | `…06` | Target grind size | read/write/notify | 0–1500 |

**Every value is a UInt16, big-endian, exactly two bytes.** A physical unit
reading 499 returns `0x01 0xF3`; little-endian would decode that as 62209. There
is no framing, checksum, or JSON layer — each characteristic carries one value.

`bootSign` is a command rather than a measurement: `1` manual start, `2` timed
start, `3` smart start, `4` stop, `5` sync the target grind size to the current
one. It reads `0` when idle.

Setting a grind size is two writes: the target angle, then boot sign `5` after
120 ms so the firmware moves the burr to it. The driver exposes that as a single
`setAndApply` command.

## Data channels

`motorRpm`, `feedRpm`, `bootSign`, `servoAngle`, `targetAngle`.

## Commands

Available through `POST /api/v1/sensors/:id/execute`.

| Command | Purpose |
| --- | --- |
| `getValues` | Return the last known values without touching the device |
| `readAll` | Re-read every characteristic from the device |
| `writeMotorRpm` | Write motor RPM |
| `writeFeedRpm` | Write feed RPM |
| `writeBootSign` | Write the boot sign |
| `writeTargetAngle` | Write the target grind size |
| `setAndApply` | Write the target, wait 120 ms, then sync it |

Writes take `{"value": <int>}` and are clamped to the channel's declared range
before the two bytes are encoded.

## Control page

The plugin serves a live control page at
`/api/v1/plugins/crystal.reaplugin/ui`:

```
GET  /api/v1/plugins/crystal.reaplugin/ui            -> the page
GET  /api/v1/plugins/crystal.reaplugin/ui?state=1    -> cached JSON state
POST /api/v1/plugins/crystal.reaplugin/ui            -> {commandId, params}
```

The page shows a characteristic table (name, UUID suffix, access, live value), a
large current-grind-size readout, sliders with matching number boxes for each
writable channel at the protocol's own step sizes, boot-sign shortcut buttons,
a one-click set-and-apply, and a read/write/notify log. It toggles between
English and Chinese.

It drives **the same command surface** the Sensor API exposes, so the HTTP layer
is transport only. Polling reads the cached values and never touches the device.

## Known firmware behaviour

The device broadcasts only briefly after power-on and then goes silent, and its
connection is fragile — independent probes (Chrome Web Bluetooth and Python
bleak) see it drop after one to two seconds, and a direct CoreBluetooth probe on
macOS reproduced drops between 0.45 s and 4.7 s. The same probe also held one
connection open for over 30 seconds with no other Bluetooth central active,
which suggests contention is at least part of it rather than the firmware alone.

The driver therefore subscribes to notifications instead of polling, and reads
each channel once at connect. If the link drops, Decaid's reconnect policy
re-establishes it and the driver re-subscribes and re-reads.

An unrelated observation from the same probe: the physical unit reports
`…05` (current grind size) as writable, while the reference protocol notes
describe it as read-only. The driver mirrors the device and subscribes without
writing it.

## Releasing

`scripts/package.sh` builds `dist/crystal.reaplugin-<version>.zip`. Pushing a
`vX.Y.Z` tag runs the same script in CI and publishes the release.

Decaid enforces three things the script keeps in sync:

- the release tag is `X.Y.Z` or `vX.Y.Z` and equals `manifest.version` exactly
- the release carries exactly one `.zip` asset
- the archive holds a single top-level `crystal.reaplugin/` directory containing
  `manifest.json` and `plugin.js`

## License

Not yet chosen. Until one is added, this repository is all rights reserved by
default.
