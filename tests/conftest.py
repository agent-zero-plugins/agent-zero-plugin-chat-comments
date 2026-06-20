"""pytest conftest for an agent-zero-plugins plugin source repo.

Provides the `plugin_dir` fixture every a0_plugin_testkit assertion needs.
Point it at this plugin's source directory.
"""

from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def plugin_dir() -> Path:
    """Path to this plugin's source directory.

    The testkit's assertions take this as their first argument:
        assert_extension_at_surface(plugin_dir, ...)
        assert_no_dead_plugin_hooks(plugin_dir)
        etc.
    """
    # Replace `my_plugin` with your plugin's directory name after cloning
    # this template.
    return Path(__file__).resolve().parent.parent / "my_plugin"
