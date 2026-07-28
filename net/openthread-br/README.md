# OpenThread Border Router

This package contains the OpenThread Border Router.

## Requirements

To use this package, you need a Thread Radio Co-Processor (RCP): an 802.15.4
radio running the `ot-rcp` firmware, in practice a USB dongle. No Turris device
has one built in.

This packaging is tested with a Home Assistant Connect ZBT-2, which pairs a
Silicon Labs MG24 radio with an ESP32-S3 acting as a USB-serial bridge. It
identifies itself as `SL-OPENTHREAD/…; EFR32` in `ubus call otbr version`.

Nordic Semiconductor nRF52840 USB dongles also work, and are what the package
was originally written against.

Building and flashing a dongle with the Thread RCP firmware is out of scope of
this document. One caveat is worth repeating for the nRF52840 specifically,
because it is easy to lose time to: the dongle ships with the U2F bootloader,
and to get it into mass storage mode you plug it in while holding the reset
button. After the first flash with ot-rcp firmware that stops working, and you
have to double-press reset after plugging it in instead.

## Packaging decisions

### Configurable package build

OpenThread is complex software. Adding config options to change the build of
the package will likely result in more bug reports. As the package and its
dependencies are unlikely to fit in any router with small flash (16MB or less),
I don't see much point in making things configurable for reducing size either.

### Version string

`OTBR_VERSION` is set to `PKG_VERSION`. Without it the build falls back to the
CMake project version, because the repacked source tree has no git directory
for `git describe` to read, so `otbr-agent --version` and the `Running ...`
line it logs on every start would report `0.3.0` rather than the release the
package was built from.

### Firewall support

The upstream Thread ingress filter is a shell script driving `ip6tables` and
`ipset`, which is a poor fit for a firewall4 system. This package instead
carries the in-process nftables backend proposed in
[ot-br-posix#3325](https://github.com/openthread/ot-br-posix/pull/3325), which
is the feature asked for in
[ot-br-posix#1675](https://github.com/openthread/ot-br-posix/issues/1675), and
builds with `OTBR_NFTABLES=ON`. otbr-agent then talks to nftables over netlink
and needs no iptables or ipset at all. Setting `OTBR_NFTABLES` also forces
`OT_FIREWALL` off, so the OpenThread core ipset producer does not run
alongside it.

The filtering is split across two nftables tables, and it has to be:

`inet otbr` is created and maintained by otbr-agent. It holds the ingress
filter, whose two prefix sets are rebuilt from Thread network data every time
the mesh changes, covering the on-mesh prefixes and the mesh-local /64. That
cannot be expressed in firewall4, which renders a static ruleset from UCI and
has no view of Thread network data. Nor can otbr-agent put the sets in the fw4
table, because firewall4 flushes and regenerates `inet fw4` on every reload.

`inet fw4` keeps the static policy: which zones may reach Thread, and what may
reach the router itself. This package adds a `thread` zone for that on first
install, permitting `lan` and `wan` forwarding both ways, ICMPv6 and DHCPv6
from Thread, and mDNS from `lan`. Adjust it as you would any other zone; it is
not rewritten on upgrade.

Both tables are evaluated and a drop in either wins, so the zone only has to
permit traffic. otbr-agent still decides what is allowed into the mesh.

Note that the ingress filter is scoped to forwarded traffic. It never sees
packets addressed to the router itself, so services that otbr-agent listens on
are firewall4's responsibility alone. That is independent of this package's
decision to leave the REST API off.

`fw4 flush` deletes every table in the ruleset, not just its own, and that is
what `/etc/init.d/firewall stop` runs. On a Turris router that takes out
`inet turris-sentinel`, `ip bcp38` and the `mangle` tables along with
`inet otbr`.

Packages that own a table handle this by registering a firewall4 include, which
fw4 runs on every start and reload; `bcp38` and `sentinel-firewall` both do, and
both come back on the next `/etc/init.d/firewall start`. Theirs simply rebuild
unconditionally, because their rules come from UCI and a shell script can
regenerate them. Ours cannot: the ingress sets are built by otbr-agent from live
Thread network data, so the include instead notices the table has gone and
brings the Thread interface back up, letting otbr-agent rebuild it.

Not every table recovers, though. `ip mangle` and `ip6 mangle` are the
compatibility tables that `iptables-nft` creates on demand, they have no owner
registered with fw4, and a stop/start cycle leaves them missing until whatever
added those rules runs again. That is not something this package introduces or
can fix, but it is worth knowing when reading `nft list tables` after a firewall
restart: a missing `mangle` is a pre-existing consequence of `fw4 flush`, not a
symptom of the Thread border router.

### mDNS

The package uses OpenThread's internal mDNS implementation
(`-DOTBR_MDNS=openthread`), which is upstream's default. This drops the
mDNSResponder dependency entirely: no separate daemon, and no Avahi, whose
libavahi-client requirement would have pulled in D-Bus.

The internal implementation advertises on a single infrastructure interface,
the one selected by the `backbone_network` option. Anything that needs to be
announced on more than one interface still needs a general-purpose responder.

It coexists with umdns, which remains the provider for other packages'
services. Each opens its own socket bound to port 5353 with SO_REUSEADDR and
SO_REUSEPORT, so the kernel admits both binds and delivers multicast traffic to
each of them, and they do not claim the same host name. Note that SO_REUSEPORT
load-balances unicast UDP, so a reply addressed to one daemon's socket can be
delivered to the other; only the multicast path is reliably seen by both.

### REST Server

The REST server is disabled. It is unauthenticated and sends
`Access-Control-Allow-Origin: *`, while exposing the Thread dataset —
including the network key — for reading and replacement, and neither the
OpenThread firewall nor firewall4's default `lan` zone protects it.

Remote dataset management is instead expected to go over Matter, through the
Thread Border Router Management cluster, which authenticates the caller as a
member of the fabric and requires the Manage privilege. Local management over
ubus, LuCI and `ot-ctl` is unaffected.

### ubus methods for Matter

The package carries a patch series, originally by Karsten Sperling, that adds
the ubus surface a Matter Network Infrastructure Manager needs, plus the
additions required to manage a running network:

| method | purpose |
| --- | --- |
| `version` | OTBR, host, RCP and Thread version strings |
| `status` | border agent ID, device role, attached flag, active and pending dataset |
| `provision` | form a network from a hex encoded active dataset |
| `set_pending` | schedule a migration from a hex encoded pending dataset |
| `deprovision` | detach and erase the dataset |

It also emits `device_role_changed`, `active_dataset_changed` and
`pending_dataset_changed` notifications, so a subscriber does not have to poll.

`provision` and `deprovision` go through the host abstraction rather than the
OpenThread API directly, which keeps the host's Thread enabled state
consistent — `set_pending` refuses to run otherwise — and makes them work in
NCP mode as well as RCP.

### TREL support

Thread Radio Encapsulation Link support is enabled, as it allows Border Routers
to communicate over other links (e.g. Ethernet), reducing traffic over the
802.15.4 radios.

The following Github discussion contains a good explanation of TREL:
https://github.com/openthread/openthread/discussions/8478

### UCI/netifd support

The package contains a minimal netifd protocol handler. This allows configuring
the Thread network in /etc/config/network. The agent will be started by netifd,
rather than using an init script.

netifd only scans /lib/netifd/proto at startup, so right after installing this
package the new protocol is not known yet and the interface stays down with
"NO_DEVICE". Restart the network once (`/etc/init.d/network restart`) or reboot;
this is ordinary OpenWrt behaviour for packages that add a protocol handler,
wireguard-tools included.

OpenThread does not store prefix information in non-volatile storage. As a
result, every time the agent is restarted, a different prefix would be used.
This is not very nice, and makes it very difficult to run the OpenThread Border
Router on a device that is not your main router. Therefore, prefixes can be
configured in /etc/config/network. This way, you can add a static route to the
Thread prefix(es) in your main router, making it possible to access devices on
the Thread network from your entire network.

## Create network

When starting the OpenThread Border Router for the first time, a Thread network
must be created.

As the agent is started by netifd, we first need to create an interface in
/etc/config/network:

```
config interface 'thread'
        option device 'wpan0'
        option proto 'openthread'
        option backbone_network 'lan'
        option radio_url 'spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=460800'
        list prefix 'fd6f:5772:5468:7200::/64 paros'
        option verbose '0'
```

Only backbone_network and device are required; the protocol handler fails the
interface if one of them is missing. Everything else -- dataset, prefix and
verbose -- is optional, and radio_url is derived from the RCP when it is not
set. If something isn't working, check ifstatus for the OpenThread interface:

```
# ifup thread
# ifstatus thread
{
        "up": false,
        "pending": false,
        "available": true,
        "autostart": false,
        "dynamic": false,
        "proto": "openthread",
        "data": {

        },
        "errors": [
                {
                        "subsystem": "openthread",
                        "code": "MISSING_BACKBONE_NETWORK"
                }
        ]
}
```

In the above example, the backbone_network option is missing.

The protocol handler will automatically start the the Thread network, so we
need to bring it down for the initial setup. This only needs to be done once.

```
ubus call otbr threadstop
```

### LuCI

Install `luci-proto-openthread` and `luci-app-openthread`.

`luci-proto-openthread` adds the `openthread` protocol to Network →
Interfaces, so the interface described above can be created from the web
interface rather than by editing `/etc/config/network`. Pick the device, set
the backbone network and the radio URL; the advanced tab carries the dataset,
the on-mesh prefixes and verbose logging. The netifd caveat above applies here
too — the protocol only appears in the list once netifd has restarted.

`luci-app-openthread` adds Network → Thread, which is where the network itself
is managed: creating a network or joining an existing one, commissioning a
device with its joiner credential, and the MAC filter. It also shows what the
mesh currently looks like — the neighbour table with how long since each was
last heard, and the router table with link quality and path cost.

### CLI

```
ot-ctl dataset init new
ot-ctl dataset panid 0x12ab
ot-ctl dataset extpanid 12ab12ab12ab12ab
ot-ctl dataset networkname OpenWrThread
ot-ctl dataset networkkey ddf429af1c52d1735ffaf36fae343ee8
ot-ctl dataset commit active
ot-ctl ifconfig up
ot-ctl thread start
ot-ctl netdata register
```

### Configure route

Before you can join a device to your new Thread network, you must add a route
to the Thread prefix on the commissioner device via the OpenWrt router running
the OpenThread Border Router.

Get the prefix:
```
ot-ctl prefix
```

Example output:

```
fd6b:a92f:c531:1::/64 paros low f000
Done
```

Configuring the route is out of scope of this document, but it must be done, or
joining Thread devices will fail.

### Get hex-encoded operational dataset TLV

This is needed to join devices to the Thread Network.

```
ot-ctl dataset active -x
```

Example output:

```
0e080000000000010000000300001035060004001fffe00708fd488c6a892ec30c04106e220c964a14a7e10e9004691920ec390c0402a0f7f80102ffff030b5468726541646c6576696f0208ffffffffffffffff0510ddf429af1c52d1735ffaf36fae343ee8
```

## Join another OpenThread Border Router

Simply configure the active dataset in /etc/config/network:

```
config interface 'thread'
        option device 'wpan0'
        option proto 'openthread'
        option backbone_network 'lan'
        option dataset '0e080000000000010000000300000f35060004001fffe0020836b86cd9746ab3080708fd9850cbe719b1d205101f11a11320828c7a6ebc2f2e675c0dca030e686f6d652d617373697374616e740102716f041025804ed78614258ebedf4e2db37b3b6e0c0402a0f7f8'
        list prefix 'fd6f:5772:5468:7200::/64 paros'
        option radio_url 'spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=460800'
        option verbose '0'
```

Afterwards, bring up the interface:

```
ifup thread
```

## Join a Thread device via Matter

### ESP32
The following procedure has been tested with an ESP32-C6 using [the Matter
lighting-app example](https://github.com/project-chip/connectedhomeip/tree/master/examples/lighting-app/esp32).
Building and flashing that app is out of scope of this document.

During startup, the lighting app will print the SetupQRCode to the serial
console:

```
I (1614) chip[SVR]: SetupQRCode: [MT:Y.K9042C00KA0648G00]
I (1624) chip[SVR]: Copy/paste the below URL in a browser to see the QR Code:
I (1634) chip[SVR]: https://project-chip.github.io/connectedhomeip/qrcode.html?data=MT%3AY.K9042C00KA0648G00
I (1644) chip[SVR]: Manual pairing code: [34970112332]
```

Decide on a node ID for the device.

```
./chip-tool pairing code-thread 0x65737933320000 hex:0e080000000000010000000300001035060004001fffe00708fd488c6a892ec30c04106e220c964a14a7e10e9004691920ec390c0402a0f7f80102ffff030b5468726541646c6576696f0208ffffffffffffffff0510ddf429af1c52d1735ffaf36fae343ee8 MT:Y.K9042C00KA0648G00 --paa-trust-store-path /path/to/connectedhomeip/credentials/test/attestation/
```

