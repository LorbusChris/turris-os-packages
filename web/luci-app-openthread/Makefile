#
# Copyright (c) 2026 The OpenThread Authors
#
# This is free software, licensed under the BSD-3-Clause license.
#

include $(TOPDIR)/rules.mk

PKG_LICENSE:=BSD-3-Clause
PKG_MAINTAINER:=Christian Glombek <c.glombek@cosa.systems>
# This app supersedes the Lua/CBI luci-app-openthread carried in the ot-br-posix
# tree, which is versioned from that repository's commit date and ships as
# 2023.08.01~1738d8cd. The two share no files, so an installed copy of the old
# app is only replaced if opkg sees this as the newer package -- and any 1.x
# version sorts below 2023.08.01, which would strand the old app in place.
PKG_VERSION:=2026.08.01

LUCI_NAME:=luci-app-openthread
LUCI_TITLE:=LuCI Support for OpenThread Border Router
LUCI_DEPENDS:=+luci-base +openthread-br +rpcd-mod-ucode
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=Manage the Thread network of the OpenThread Border Router: \
  status, joining, scanning and dataset configuration.

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
