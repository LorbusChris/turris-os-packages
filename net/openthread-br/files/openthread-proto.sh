#!/bin/sh
#
# SPDX-FileCopyrightText: 2023 Stijn Tintel <stijn@linux-ipv6.be>
# SPDX-License-Identifier: GPL-2.0-only

OTCTL="/usr/sbin/ot-ctl"
PROG="/usr/sbin/otbr-agent"
RCP_PROG="/usr/sbin/otbr-rcp"

[ -x "$PROG" ] || exit 0

[ -n "$INCLUDE_ONLY" ] || {
	. /lib/functions.sh
	. /lib/functions/network.sh
	. ../netifd-proto.sh
	init_proto "$@"
}

# ot-ctl defaults to wpan0; steer it to the instance this protocol runs.
otctl() {
	"$OTCTL" -I "$device" "$@"
}

proto_openthread_add_prefix() {
	prefix="$1"
	# shellcheck disable=SC2086
	[ -n "$prefix" ] && otctl prefix add $prefix
}

proto_openthread_init_config() {
	proto_config_add_array 'prefix:list(string)'
	proto_config_add_boolean verbose
	proto_config_add_string backbone_network
	proto_config_add_string dataset
	proto_config_add_string radio_url
	proto_config_add_string rcp
	proto_config_add_boolean rcp_firmware_update
	proto_config_add_int uart_baudrate
	proto_config_add_boolean uart_flow_control

	available=1
	no_device=1
}

proto_openthread_setup_error() {
	interface="$1"
	error="$2"
	proto_notify_error "$interface" "$error"
	# prevent netifd from trying to bring up interface over and over
	proto_block_restart "$interface"
	proto_setup_failed "$interface"
	exit 1
}

proto_openthread_setup_retry() {
	# A missing RCP dongle is not a configuration error, but the interface
	# must still be blocked: netifd re-runs a failed setup immediately and
	# without backoff, which would busy-loop until a dongle appears. The
	# hotplug handler's ifup lifts the block, so recovery is unaffected;
	# this helper differs from proto_openthread_setup_error only in intent.
	proto_openthread_setup_error "$@"
}

proto_openthread_setup_defer() {
	# Not a configuration error, just too early: the host dependency
	# registered above re-runs this setup when the backbone comes up.
	# netifd retries a failed setup without backoff, so pace it here
	# rather than blocking the interface for good.
	proto_notify_error "$1" "$2"
	sleep 5
	proto_setup_failed "$1"
	exit 1
}

proto_openthread_setup() {
	interface="$1"
	device="$2"

	# The settings path is compiled to /etc/openthread so the Thread network
	# survives reboots; /var/lib is tmpfs on OpenWrt.
	mkdir -p /etc/openthread

	json_get_vars backbone_network dataset device radio_url rcp \
		rcp_firmware_update:1 uart_baudrate:0 uart_flow_control:1 verbose:0

	[ -n "$backbone_network" ] || proto_openthread_setup_error "$interface" MISSING_BACKBONE_NETWORK
	proto_add_host_dependency "$interface" "" "$backbone_network"
	network_get_device backbone_ifname "$backbone_network"

	[ -n "$backbone_ifname" ] || proto_openthread_setup_defer "$interface" MISSING_BACKBONE_IFNAME
	[ -n "$device" ] || proto_openthread_setup_error "$interface" MISSING_DEVICE

	if [ -z "$radio_url" ]; then
		case "$rcp" in
		/dev/*)
			# A fixed serial device needs no discovery.
			radio_url="spinel+hdlc+uart://$rcp"
			;;
		*)
			# Let otbr-rcp locate the dongle by its USB properties and,
			# when a handler knows how, install or update its firmware.
			# This runs here rather than under the launched command: a
			# flash can take minutes, and it must not race the bounded
			# wait for the agent's ubus object below.
			RCPTTY=
			eval "$("$RCP_PROG" \
				$([ "$rcp_firmware_update" -eq 0 ] || echo --update) \
				"${rcp:-any}")"
			[ -n "$RCPTTY" ] || \
				proto_openthread_setup_retry "$interface" RCP_NOT_FOUND
			radio_url="spinel+hdlc+uart://$RCPTTY"
			;;
		esac
		radio_url="${radio_url}?uart-exclusive"
		[ "$uart_baudrate" -eq 0 ] || radio_url="${radio_url}&uart-baudrate=${uart_baudrate}"
		[ "$uart_flow_control" -eq 0 ] || radio_url="${radio_url}&uart-flow-control"
	fi

	# The vendor name is compiled in; the model is per device, so take it from
	# board.json. Together they form the MeshCoP service instance name a user
	# sees when adding this border router in a Thread client. otbr-agent exits
	# if the model is not supplied one way or the other.
	model="$(jsonfilter -q -i /etc/board.json -e @.model.name)"

	# Collect the arguments in the positional parameters, not in a string:
	# a model name contains a space ("Turris Omnia"), which word splitting on
	# an unquoted expansion would break into two arguments.
	set -- --auto-attach=0 "-I$device" "-B$backbone_ifname" \
		--model-name "${model:-BorderRouter}" \
		"$radio_url" "trel://$backbone_ifname"
	[ "$verbose" -eq 0 ] || set -- -v "$@"

	# run in subshell to prevent wiping json data needed for prefixes
	( proto_run_command "$interface" "$PROG" "$@" )

	ubus -t30 wait_for otbr

	[ -n "$dataset" ] && {
		otctl dataset set active "$dataset"
	}

	json_for_each_item proto_openthread_add_prefix prefix
	ubus call otbr threadstart || proto_openthread_setup_error "$interface" MISSING_UBUS_OBJ
	otctl netdata register

	proto_init_update "$device" 1 1
	proto_send_update "$interface"
}

proto_openthread_teardown() {
	interface="$1"
	ubus call otbr threadstop
	proto_kill_command "$interface"
}

[ -n "$INCLUDE_ONLY" ] || {
	add_protocol openthread
}
