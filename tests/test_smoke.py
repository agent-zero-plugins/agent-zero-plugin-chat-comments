"""Minimal smoke test using the a0_plugin_testkit.

Replace / extend with assertions specific to your plugin. The testkit
provides assertions for: extension-point IDs, JS hooks, plugin lifecycle
hooks, module public attrs, dependency audits, A0-API audits, container
URL leakage, undeclared listening ports. See `a0-plugin-testkit` skill for
the full surface.
"""

import pytest


pytestmark = pytest.mark.unit


def test_plugin_dir_resolves(plugin_dir):
    """Sanity check: conftest's plugin_dir fixture points at a real dir."""
    assert plugin_dir.is_dir(), f"plugin_dir does not exist: {plugin_dir}"
    assert (plugin_dir / "plugin.yaml").is_file(), (
        f"plugin_dir missing plugin.yaml: {plugin_dir}"
    )


def test_plugin_yaml_has_version(plugin_dir):
    """The gate's CI checks plugin.yaml.version against meta.yaml.version.

    Catch malformed manifests locally before pushing.
    """
    import yaml

    manifest = yaml.safe_load((plugin_dir / "plugin.yaml").read_text())
    assert "version" in manifest, "plugin.yaml missing required `version:` field"
    assert "name" in manifest, "plugin.yaml missing required `name:` field"


# ── Where to add testkit-based tests ─────────────────────────────────────────
#
# Once you've added tools / extensions / hooks to my_plugin/__init__.py,
# use the testkit's assertions to verify they wire into A0 correctly:
#
#   from a0_plugin_testkit.assertions import (
#       assert_extension_at_surface,
#       assert_no_dead_plugin_hooks,
#       assert_plugin_has_thumbnail,
#       audit_a0_api_usage,
#       audit_dependencies,
#   )
#
#   def test_no_dead_plugin_hooks(plugin_dir):
#       assert_no_dead_plugin_hooks(plugin_dir)
#
# See the a0-plugin-testkit skill (.claude/skills/a0-plugin-testkit/) for
# the full assertion catalogue + the red-first methodology.
