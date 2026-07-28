'use strict';
'require form';
'require network';
'require tools.widgets as widgets';

// The Thread radio is a tun-like netdev with no DEVTYPE in sysfs, so the
// generic Device class falls back to the ethernet icon. Own the device
// instances (same pattern as luci-proto-relay) so the interface list shows
// a wireless icon and a meaningful type.
var ThreadDevice = {
	getType: function() {
		return 'wifi';
	},

	getTypeI18n: function() {
		return _('Thread Radio');
	}
};

function threadDev(proto, name) {
	var m = name ? name.match(/^([^:/]+)/) : null;
	return m ? network.instantiateDevice(m[1], proto, ThreadDevice) : null;
}

return network.registerProtocol('openthread', {
	getI18n: function() {
		return _('Thread');
	},

	getDevice: function() {
		return threadDev(this, this._get('device'));
	},

	getL2Device: function() {
		return threadDev(this, this._ubus('device'));
	},

	getL3Device: function() {
		return threadDev(this, this._ubus('l3_device'));
	},

	getPackageName: function() {
		return 'openthread-br';
	},

	renderFormOptions: function(s) {
		var o;

		o = s.taboption('general', widgets.NetworkSelect, 'backbone_network',
			_('Backbone network'),
			_('The network whose interface carries mDNS, TREL and border routing for the Thread mesh; usually the LAN.'));
		o.exclude = s.section;
		o.nocreate = true;
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'radio_url',
			_('Radio URL'),
			_('How otbr-agent reaches the 802.15.4 radio.'));
		o.rmempty = false;
		o.placeholder = 'spinel+hdlc+uart:///dev/ttyACM0?uart-baudrate=460800';

		o = s.taboption('advanced', form.Value, 'dataset',
			_('Operational dataset'),
			_('Hex-encoded active operational dataset committed at startup. Usually left empty: the network is formed or joined from the OpenThread application instead.'));
		o.optional = true;
		o.datatype = 'hexstring';

		o = s.taboption('advanced', form.DynamicList, 'prefix',
			_('On-mesh prefixes'),
			_('Prefixes announced to the Thread network.'));
		o.optional = true;

		o = s.taboption('advanced', form.Flag, 'verbose',
			_('Verbose logging'));
		o.optional = true;
	}
});
