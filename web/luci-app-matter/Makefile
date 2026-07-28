#
# Copyright (c) 2026 The OpenThread Authors
#
# This is free software, licensed under the BSD-3-Clause license.
#

include $(TOPDIR)/rules.mk

PKG_LICENSE:=BSD-3-Clause
PKG_MAINTAINER:=Christian Glombek <c.glombek@cosa.systems>
PKG_VERSION:=1.0

LUCI_NAME:=luci-app-matter
LUCI_TITLE:=LuCI Support for the Matter network manager
# qrencode is optional: with it installed, the onboarding card renders
# the QR image server side; without it the payload string is shown.
LUCI_DEPENDS:=+luci-base +matter-netman +qrencode +rpcd-mod-ucode
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=Commission the Matter network manager into a Matter \
  fabric: commissioning window control and onboarding codes.

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
