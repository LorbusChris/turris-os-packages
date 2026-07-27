# matter-netman

Packages the Matter Network Infrastructure Manager from connectedhomeip's
network-manager example. It exposes this router to a Matter fabric as a
Network Infrastructure Manager device (device type 0x0090) whose Thread
Border Router Management cluster reads and writes the Thread network
credentials of the local otbr-agent over ubus.

## Packaging decisions

The mbedtls variant is the default, as it is upstream. Matter's AEAD is
AES-CCM, and OpenWrt builds mbedtls without `MBEDTLS_CCM_C`, so the variant
selects that option rather than depending on it. A plain dependency would
hide the package from menuconfig, and drop it without a word from a seed
config, until the operator had found an obscure cipher symbol under
libmbedtls for themselves.

Patches 030-032 extend the delegate: RevertActiveDataset support, pending
dataset (PANChange) support through otbr's `set_pending` ubus method, and
asynchronous provision/deprovision invocations. otbr does not reply to
`provision` until the device has attached, which can take tens of seconds;
a blocking invoke with the delegate's two-second timeout made every
SetActiveDatasetRequest report failure while the network formed anyway.

## ubus ACL

The daemon runs as the unprivileged `matter` user and reaches otbr through
ubus. Its ACL is installed as `/usr/share/acl.d/matter_acl.json`, but ubusd
only reads that directory when it starts: after installing this package on
a running system, restart ubusd (`kill $(pidof ubusd)`; procd respawns it
and clients reconnect) or reboot. Until then every otbr call from the
daemon fails with "Not found" and the TBRM cluster serves nulls.

Note busybox pgrep when doing this by hand: `pgrep -x ubusd` matches
against the full command line, never finds `/sbin/ubusd`, and exits
quietly - use `pidof`.
