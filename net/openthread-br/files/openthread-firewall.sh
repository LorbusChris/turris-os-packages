#!/bin/sh
#
# Called by firewall4 through the include registered in /etc/config/firewall.
# fw4 runs script includes on every start and reload, so no trigger option is
# needed; "reload" and "family" are firewall3 options that fw4 rejects.
#
# otbr-agent keeps its own nftables table, "otbr", holding the Thread ingress
# filter. That filter cannot live in the fw4 ruleset: its two prefix sets are
# rebuilt from Thread network data whenever the mesh changes, and fw4 flushes
# and regenerates its own table on every reload, which would drop them.
#
# fw4 reload, restart and stop only touch inet fw4, so nothing needs doing for
# those. "fw4 flush" is different: it walks every table in the ruleset and
# deletes it, ours included, and otbr-agent has no way to notice. That is what
# /etc/init.d/firewall stop runs. Recovery lands here on the next start, which
# is the right moment, since a stopped firewall has no policy to protect.

THREAD_TABLE="otbr"

# Only act when otbr-agent is up; a stopped border router legitimately has no
# table. Ask ubus rather than looking for the process: busybox pgrep -x matches
# the whole command line, so it never finds /usr/sbin/otbr-agent, and pgrep -f
# can match this script's own command line. The ubus object only exists once
# the daemon has registered, which is exactly the condition we care about.
ubus -t1 list otbr >/dev/null 2>&1 || exit 0

if ! nft list table inet "$THREAD_TABLE" >/dev/null 2>&1; then
	logger -t openthread-firewall \
		"inet $THREAD_TABLE went away (fw4 flush?), restarting otbr-agent to rebuild the Thread ingress filter"
	# The interface is managed by netifd, so go through it rather than
	# poking the process directly.
	for iface in $(ubus list network.interface.* 2>/dev/null | sed 's/^network\.interface\.//'); do
		[ "$(ubus call "network.interface.$iface" status 2>/dev/null | jsonfilter -q -e '@.proto')" = "openthread" ] || continue
		ifup "$iface"
	done
fi

exit 0
