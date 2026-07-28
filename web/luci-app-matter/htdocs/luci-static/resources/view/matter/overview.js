'use strict';
'require view';
'require dom';
'require uci';
'require network';
'require poll';
'require rpc';
'require ui';

var callOnboarding = rpc.declare({
	object: 'luci.matter',
	method: 'onboarding'
});

var callRemoveFabric = rpc.declare({
	object: 'luci.matter',
	method: 'remove_fabric',
	params: [ 'index' ]
});

var callOpenWindow = rpc.declare({
	object: 'luci.matter',
	method: 'open_window'
});

var callCloseWindow = rpc.declare({
	object: 'luci.matter',
	method: 'close_window'
});

function renderCodes(matter) {
	var qrCell;
	if (matter.qr_svg) {
		var holder = E('div', { 'style': 'width:180px' });
		holder.innerHTML = matter.qr_svg;
		var svg = holder.firstElementChild;
		if (svg) {
			svg.setAttribute('width', '180');
			svg.setAttribute('height', '180');
		}
		qrCell = holder;
	}
	else {
		qrCell = E('code', {}, [ matter.qr || '' ]);
	}

	return E('div', { 'class': 'table' }, [
		E('div', { 'class': 'tr' }, [
			E('div', { 'class': 'td left', 'style': 'width:33%' }, _('Manual pairing code')),
			E('div', { 'class': 'td left' }, E('big', {}, E('code', {}, [ matter.manual_code ])))
		]),
		E('div', { 'class': 'tr' }, [
			E('div', { 'class': 'td left', 'style': 'width:33%' }, _('QR code')),
			E('div', { 'class': 'td left' }, qrCell)
		])
	]);
}

function refreshCard(container) {
	return callOnboarding().then(function(matter) {
		dom.content(container, renderCardBody(statusReply(matter)));
	});
}

// Only the vendor ids the Matter SDK itself names are mapped; anything
// else is shown as the raw id rather than guessed at.
var VENDOR_NAMES = {
	0x1349: 'Apple',
	0x1384: 'Apple',
	0x134B: 'Nabu Casa',
	0x6006: 'Google',
	0xFFF1: _('Test vendor 1'),
	0xFFF2: _('Test vendor 2'),
	0xFFF3: _('Test vendor 3'),
	0xFFF4: _('Test vendor 4')
};

function vendorName(id) {
	if (id == null)
		return '?';
	return VENDOR_NAMES[id] || '0x%04X'.format(id);
}

function handleRemoveFabric(fabric) {
	var name = fabric.Label || vendorName(fabric.VendorId);
	ui.showModal(_('Remove pairing'), [
		E('p', {}, [ _('This unpairs the controller') , ' ', E('strong', {}, [ name ]),
			' ', _('(fabric %d).').format(fabric.Index) ]),
		E('p', { 'class': 'alert-message warning' },
			_('That controller loses access to this device immediately, including any Thread network credentials it manages here. It has to commission the device again to regain access.')),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
			' ',
			E('button', {
				'class': 'cbi-button cbi-button-negative important',
				'click': ui.createHandlerFn({}, function() {
					return callRemoveFabric(fabric.Index).then(function(r) {
						var err = replyError(r);
						ui.hideModal();
						if (err) {
							ui.addNotification(null, E('p', _('Removing the pairing failed.')), 'error');
							return;
						}
						location.reload();
					});
				})
			}, _('Remove'))
		])
	], 'cbi-modal');
}

// The Wi-Fi credentials the node shares are selected by configuration,
// not by the controller: which network's access point, or a pinned
// wifi-iface section, and whether to share at all.
function handleSharingSettings() {
	return Promise.all([ uci.load('matter'), network.getNetworks() ]).then(function(data) {
		var networks = data[1] || [];
		var share = uci.get('matter', 'settings', 'wifi_share');
		var netName = uci.get('matter', 'settings', 'wifi_network') || 'lan';
		var iface = uci.get('matter', 'settings', 'wifi_iface') || '';
		var vendorName = uci.get('matter', 'settings', 'vendor_name') || '';
		var primaryIface = uci.get('matter', 'settings', 'primary_interface') || '';
		var diagIface = uci.get('matter', 'settings', 'diagnostics_interface') || '';
		var ethDiag = uci.get('matter', 'settings', 'ethernet_diagnostics');

		var shareInput = E('input', { 'type': 'checkbox', 'class': 'cbi-input-checkbox' });
		shareInput.checked = (share != '0');

		var netSelect = E('select', { 'class': 'cbi-input-select' },
			networks.filter(function(n) { return n.getName() != 'loopback'; })
				.map(function(n) {
					return E('option', { 'value': n.getName() }, [ n.getName() ]);
				}));
		netSelect.value = netName;

		var ifaceInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': iface,
			'placeholder': _('automatic')
		});

		var vendorInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': vendorName,
			'placeholder': _('from the firmware')
		});

		var primaryInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': primaryIface,
			'placeholder': 'br-lan'
		});

		var diagInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': diagIface,
			'placeholder': _('the Matter interface')
		});

		var ethDiagInput = E('input', { 'type': 'checkbox', 'class': 'cbi-input-checkbox' });
		ethDiagInput.checked = (ethDiag != '0');

		function save() {
			uci.set('matter', 'settings', 'wifi_share', shareInput.checked ? '1' : '0');
			uci.set('matter', 'settings', 'wifi_network', netSelect.value);
			if (ifaceInput.value)
				uci.set('matter', 'settings', 'wifi_iface', ifaceInput.value);
			else
				uci.unset('matter', 'settings', 'wifi_iface');

			// Empty means the built-in default, so the option is dropped
			// rather than stored as an empty string.
			if (vendorInput.value)
				uci.set('matter', 'settings', 'vendor_name', vendorInput.value);
			else
				uci.unset('matter', 'settings', 'vendor_name');
			if (primaryInput.value)
				uci.set('matter', 'settings', 'primary_interface', primaryInput.value);
			else
				uci.unset('matter', 'settings', 'primary_interface');
			if (diagInput.value)
				uci.set('matter', 'settings', 'diagnostics_interface', diagInput.value);
			else
				uci.unset('matter', 'settings', 'diagnostics_interface');
			if (ethDiagInput.checked)
				uci.unset('matter', 'settings', 'ethernet_diagnostics');
			else
				uci.set('matter', 'settings', 'ethernet_diagnostics', '0');

			return uci.save().then(function() {
				return uci.changes();
			}).then(function(changes) {
				// Applying with nothing staged fails with "no data", so a
				// dialog closed without edits would hang on the error path.
				var pending = false;
				for (var config in (changes || {}))
					pending = true;
				return pending ? uci.apply() : null;
			}).then(function() {
				ui.hideModal();
				location.reload();
			}).catch(function(err) {
				// Notifications render behind the dialog, so close it first.
				ui.hideModal();
				ui.addNotification(null, E('p', [
					_('Applying the configuration failed.'), ' ', String(err)
				]), 'error');
			});
		}

		ui.showModal(_('Matter settings'), [
			E('h4', {}, _('Credential sharing')),
			cbiValue(_('Share Wi-Fi credentials'), shareInput,
				_('Hand the access point credentials to Matter controllers, so they can commission Wi-Fi devices onto this network without asking for the password.')),
			cbiValue(_('Network'), netSelect,
				_('The network whose access point is shared. Guest networks are excluded by choosing the network their access point is not attached to.')),
			cbiValue(_('Access point'), ifaceInput,
				_('Optional wifi-iface section name, overriding the automatic choice of the first access point on that network.')),
			E('h4', {}, _('Device identity')),
			cbiValue(_('Manufacturer'), vendorInput,
				_('Reported to Matter controllers. Left empty, the manufacturer the firmware states is used.')),
			cbiValue(_('Matter interface'), primaryInput,
				_('The network interface this device is reachable on, normally the LAN bridge. Controllers are told it is this device\'s interface, and it supplies the Ethernet diagnostics unless overridden below.')),
			E('h4', {}, _('Diagnostics')),
			cbiValue(_('Report Ethernet diagnostics'), ethDiagInput,
				_('Interface state and traffic counters are readable by any paired controller; switch off to report nothing.')),
			cbiValue(_('Diagnostics interface'), diagInput,
				_('Optional override: report the Ethernet diagnostics of this interface instead of the Matter interface — for example a physical port rather than the bridge, which has no link details of its own.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-positive important',
					'click': ui.createHandlerFn({}, save)
				}, _('Save & Apply'))
			])
		], 'cbi-modal');
	});
}

function cbiValue(title, node, hint) {
	var children = [
		E('label', { 'class': 'cbi-value-title' }, title),
		E('div', { 'class': 'cbi-value-field' }, node)
	];
	if (hint)
		children.push(E('div', { 'class': 'cbi-value-description' }, hint));
	return E('div', { 'class': 'cbi-value' }, children);
}

// A failure below the method itself resolves to a plain ubus status
// number rather than a reply object; treat that as an error, not success.
// Distinguishes "the daemon says it is not installed" from "the call
// itself failed", which otherwise both render as an absent daemon.
function statusReply(m) {
	if (m == null || typeof m != 'object')
		return { rpcerror: (typeof m == 'number' && m) ? m : 255 };
	return m;
}

function rpcErrorNote(matter) {
	return matter.rpcerror
		? E('em', {}, _('The Matter service cannot be queried (ubus error %d).').format(matter.rpcerror))
		: null;
}

function replyError(r) {
	if (typeof r == 'number')
		return r || 255;
	if (r == null || typeof r != 'object')
		return 255;
	return r.error || 0;
}

// The Matter clusters this device implements. Named where a name helps;
// the id is always shown, since that is what a controller and the
// specification call it.
var CLUSTER_NAMES = {
	0x001d: _('Descriptor'),
	0x001f: _('Access Control'),
	0x0028: _('Basic Information'),
	0x0030: _('General Commissioning'),
	0x0031: _('Network Commissioning'),
	0x0033: _('General Diagnostics'),
	0x0035: _('Thread Network Diagnostics'),
	0x0037: _('Ethernet Network Diagnostics'),
	0x003c: _('Administrator Commissioning'),
	0x003e: _('Operational Credentials'),
	0x003f: _('Group Key Management'),
	0x0450: _('Network Identity Management'),
	0x0451: _('Wi-Fi Network Management'),
	0x0452: _('Thread Border Router Management'),
	0x0453: _('Thread Network Directory')
};

function renderClusters(matter) {
	var rows = [E('tr', { 'class': 'tr table-titles' }, [
		E('th', { 'class': 'th nowrap' }, _('Endpoint')),
		E('th', { 'class': 'th' }, _('Clusters'))
	])];

	(matter.endpoints || []).forEach(function(ep) {
		var names = (ep.Clusters || []).map(function(id) {
			var num = parseInt(id, 16);
			return E('span', { 'class': 'ifacebadge', 'title': id }, [
				E('span', {}, [ CLUSTER_NAMES[num] || id, ' ', E('small', {}, [ '(' + id + ')' ]) ])
			]);
		});
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td nowrap', 'data-title': _('Endpoint') }, String(ep.Endpoint ?? '?')),
			E('td', { 'class': 'td', 'data-title': _('Clusters') }, names.length ? names : E('em', {}, _('none')))
		]));
	});

	if (rows.length == 1)
		rows.push(E('tr', { 'class': 'tr placeholder' },
			E('td', { 'class': 'td', 'colspan': 2 },
				E('em', {}, _('No information available')))));

	return E('table', { 'class': 'table' }, rows);
}

function renderFabrics(matter) {
	var rpcNote = rpcErrorNote(matter);
	if (rpcNote)
		return E('div', {}, rpcNote);

	var rows = [E('tr', { 'class': 'tr table-titles' }, [
		E('th', { 'class': 'th nowrap' }, _('Controller')),
		E('th', { 'class': 'th hide-xs' }, _('Fabric ID')),
		E('th', { 'class': 'th hide-xs' }, _('Node ID')),
		E('th', { 'class': 'th cbi-section-actions' }, ' ')
	])];

	(matter.fabric_list || []).forEach(function(f) {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td nowrap', 'data-title': _('Controller') },
				E('span', {}, [
					E('strong', {}, [ f.Label || vendorName(f.VendorId) ]),
					' ',
					E('small', {}, [ f.Label ? '(%s)'.format(vendorName(f.VendorId)) : '' ])
				])),
			E('td', { 'class': 'td hide-xs', 'data-title': _('Fabric ID') }, E('code', {}, [ f.FabricId || '?' ])),
			E('td', { 'class': 'td hide-xs', 'data-title': _('Node ID') }, E('code', {}, [ f.NodeId || '?' ])),
			E('td', { 'class': 'td middle cbi-section-actions' },
				E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': ui.createHandlerFn({}, (function(fabric) {
						return function() { return handleRemoveFabric(fabric); };
					})(f))
				}, _('Remove')))
		]));
	});

	if (rows.length == 1)
		rows.push(E('tr', { 'class': 'tr placeholder' },
			E('td', { 'class': 'td', 'colspan': 4 },
				E('em', {}, (matter.fabric_list == null)
					? _('No information available')
					: _('This device is not paired with any Matter controller.')))));

	return E('table', { 'class': 'table assoclist' }, rows);
}

// What the router currently hands out to Matter controllers: whether the
// Wi-Fi credentials are shared (and for which SSID), the fabrics joined,
// and the Thread networks listed in its directory.
function renderSharing(matter) {
	var rpcNote = rpcErrorNote(matter);
	if (rpcNote)
		return rpcNote;

	if (!matter.present || !matter.live)
		return E('em', {}, _('No information available'));

	var wifi;
	if (matter.wifi_share == null)
		wifi = E('em', {}, _('unknown'));
	else if (matter.wifi_share)
		wifi = E('span', {}, [ _('Sharing credentials of'), ' ', E('strong', {}, [ matter.wifi_ssid || '?' ]) ]);
	else
		wifi = E('em', {}, _('not shared'));

	var networks = (matter.directory || []).map(function(n) {
		// Array children are text nodes; a bare string child would be
		// parsed as HTML, and these names come from remote controllers.
		return E('span', { 'class': 'ifacebadge' }, [
			E('strong', {}, [ n.NetworkName || '?' ]),
			' ',
			E('small', {}, [ '(' + (n.ExtendedPanId || '?') + ')' ])
		]);
	});

	return E('div', { 'class': 'table' }, [
		E('div', { 'class': 'tr' }, [
			E('div', { 'class': 'td left', 'style': 'width:33%' }, _('Wi-Fi network')),
			E('div', { 'class': 'td left' }, wifi)
		]),
		// Without a border router there is no Thread network to share, so
		// the directory is not presented as something this node manages.
		matter.thread_managed
			? E('div', { 'class': 'tr' }, [
				E('div', { 'class': 'td left', 'style': 'width:33%' }, _('Thread network directory')),
				E('div', { 'class': 'td left' }, (matter.directory == null)
					? E('em', {}, _('unknown'))
					: (networks.length ? networks : E('em', {}, _('empty'))))
			])
			: E([])
	]);
}

function renderCardBody(matter) {
	var rpcNote = rpcErrorNote(matter);
	if (rpcNote)
		return E('p', {}, rpcNote);

	if (!matter.present)
		return E('p', {}, _('The Matter network manager is not installed on this device.'));

	if (!matter.live)
		return E('p', {}, _('The Matter network manager daemon is not reachable; pairing is unavailable.'));

	var windowOpen = (matter.window == 'basic' || matter.window == 'enhanced');

	if (windowOpen) {
		var closeButton = E('button', { 'class': 'cbi-button cbi-button-remove' },
			_('Close commissioning window'));
		closeButton.addEventListener('click', ui.createHandlerFn(this, function() {
			return callCloseWindow().then(function() {
				return refreshCard(document.getElementById('matter-onboarding'));
			});
		}));
		return E('div', {}, [
			E('p', {}, _('A commissioning window is open. Pair this device with a Matter controller, such as Home Assistant, using the code below.')),
			renderCodes(matter),
			closeButton
		]);
	}

	// No window open: pairing is a deliberate action, so the code is not
	// shown until a window is opened.
	var text = matter.commissioned
		? _('This device is commissioned into a Matter fabric. Open a commissioning window to add it to another controller; the pairing code and QR code are shown while the window is open.')
		: _('This device is not commissioned yet. Open a commissioning window to pair it with a Matter controller; the pairing code and QR code are shown while the window is open.');
	var button = E('button', { 'class': 'cbi-button cbi-button-action important' },
		_('Open commissioning window'));
	button.addEventListener('click', ui.createHandlerFn(this, function() {
		return callOpenWindow().then(function(r) {
			if (replyError(r))
				ui.addNotification(null, E('p', _('Opening the commissioning window failed.')), 'error');
			return refreshCard(document.getElementById('matter-onboarding'));
		});
	}));
	return E('div', {}, [ E('p', {}, text), E('div', { 'class': 'right' }, button) ]);
}

return view.extend({
	load: function() {
		return callOnboarding();
	},

	render: function(matter) {
		matter = statusReply(matter);
		var card = E('div', { 'id': 'matter-onboarding' }, renderCardBody(matter));

		// The commissioning window closes on its own after a timeout, so
		// keep the card in step with the daemon rather than trusting the
		// state from load time.
		poll.add(function() {
			return refreshCard(card);
		}, 5);

		var sharing = E('div', { 'id': 'matter-sharing' }, renderSharing(matter));

		var fabrics = E('div', { 'id': 'matter-fabrics' }, renderFabrics(matter));
		var clustersBox = E('div', { 'id': 'matter-clusters' }, renderClusters(matter));

		// A single poll for all sections: one RPC round trip, and they all
		// render from the same snapshot.
		poll.add(function() {
			return callOnboarding().then(function(m) {
				m = statusReply(m);
				dom.content(card, renderCardBody(m));
				dom.content(sharing, renderSharing(m));
				dom.content(fabrics, renderFabrics(m));
				dom.content(clustersBox, renderClusters(m));
			});
		}, 5);

		// State first, actions last: what the device is paired with and
		// what it shares, then the controls for adding a controller.
		return E([], [
			E('h2', {}, _('Matter')),
			E('div', {}, _('Commission this device into a Matter fabric.')),
			E('br'),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Paired controllers')),
				fabrics
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Shared network information')),
				sharing,
				E('div', { 'class': 'right' },
					E('button', {
						'class': 'cbi-button cbi-button-action important',
						'click': ui.createHandlerFn({}, handleSharingSettings)
					}, _('Configure\u2026')))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Onboarding')),
				card
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Implemented clusters')),
				clustersBox
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
});
