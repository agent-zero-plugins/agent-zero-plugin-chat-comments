"""pytest conftest for an agent-zero-plugins plugin source repo.

Provides the `plugin_dir` fixture every a0_plugin_testkit assertion needs.
Point it at this plugin's source directory.
"""

import sys
from pathlib import Path

import pytest

# Tests exec plugin modules straight from the plugin tree. Without this, the
# loader writes __pycache__ INTO the plugin dir (= repo root, root layout),
# which the static validator rightly flags as a packaging hazard.
sys.dont_write_bytecode = True


@pytest.fixture(scope="session")
def plugin_dir() -> Path:
    """Path to this plugin's source directory.

    The testkit's assertions take this as their first argument:
        assert_extension_at_surface(plugin_dir, ...)
        assert_no_dead_plugin_hooks(plugin_dir)
        etc.

    Root layout: the repo root IS the plugin dir (.devkit.yml plugin_dir: .)
    """
    return Path(__file__).resolve().parent.parent
