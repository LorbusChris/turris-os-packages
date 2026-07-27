# SPDX-FileCopyrightText: 2023-2026 Project CHIP Authors
# SPDX-License-Identifier: Apache-2.0

include $(TOPDIR)/rules.mk

PKG_NAME:=gn
PKG_VERSION:=2223
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://gn.googlesource.com/gn
PKG_SOURCE_DATE:=2025-03-21
PKG_SOURCE_VERSION:=6e8e0d6d4a151ab2ed9b4a35366e630c55888444
# Regenerate with: make package/gn/check FIXUP=1
PKG_MIRROR_HASH:=skip

PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE

PKG_HOST_ONLY:=1
HOST_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/host-build.mk

# gn stamps its binary with a commit position that it normally derives by
# running git describe against its own checkout. The build directory is
# unpacked from a tarball with no history, so the values for the pinned commit
# are recorded here instead.
#
# Obtain them with:
#   git describe $(PKG_SOURCE_VERSION) --abbrev=12 --match initial-commit
# which yields initial-commit-<position>-g<short hash>.
GN_COMMIT_POSITION:=$(PKG_VERSION)
GN_COMMIT:=6e8e0d6d4a15

define Package/gn
  SECTION:=devel
  CATEGORY:=Development
  TITLE:=gn
  URL:=https://gn.googlesource.com/gn
  BUILDONLY:=1
endef

define Package/gn/description
  GN is a meta-build system that generates build files for Ninja.
endef

define Host/Configure
	cd $(HOST_BUILD_DIR) && $(HOST_CONFIGURE_VARS) \
		$(STAGING_DIR_HOST)/bin/$(PYTHON) build/gen.py --no-last-commit-position
	{ echo "#ifndef OUT_LAST_COMMIT_POSITION_H_" ; \
	  echo "#define OUT_LAST_COMMIT_POSITION_H_" ; \
	  echo "#define LAST_COMMIT_POSITION_NUM $(GN_COMMIT_POSITION)" ; \
	  echo "#define LAST_COMMIT_POSITION \"$(GN_COMMIT_POSITION) ($(GN_COMMIT))\"" ; \
	  echo "#endif // OUT_LAST_COMMIT_POSITION_H_" ; \
	} > $(HOST_BUILD_DIR)/out/last_commit_position.h
endef

define Host/Compile
	$(NINJA) -C $(HOST_BUILD_DIR)/out gn
endef

define Host/Install
	$(INSTALL_DIR) $(1)/bin
	$(INSTALL_BIN) $(HOST_BUILD_DIR)/out/gn $(1)/bin
endef

$(eval $(call BuildPackage,gn))
$(eval $(call HostBuild))
