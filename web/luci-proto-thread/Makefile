# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Christian Glombek <c.glombek@cosa.systems>
PKG_VERSION:=1.0

LUCI_NAME:=luci-proto-thread
LUCI_TITLE:=Support for the Thread border router protocol
LUCI_DEPENDS:=+openthread-br
LUCI_PKGARCH:=all

# Carried here together with luci-app-openthread until both land in the
# LuCI repository; this package lives outside the luci feed, so include
# its luci.mk by absolute path like luci-app-easybird does.
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
