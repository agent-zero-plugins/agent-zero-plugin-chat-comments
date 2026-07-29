"""L1 shape suite — testkit assertions over the chat_comments plugin.

Each assertion catches a real class of shipped plugin bug (typo'd extension
points, dead hooks, missing thumbnail, undeclared deps, fabricated A0 APIs).
"""

from pathlib import Path

import pytest

from a0_plugin_testkit.assertions import (
    assert_extension_at_surface,
    assert_no_dead_plugin_hooks,
    assert_no_stray_extension_folders,
    assert_plugin_has_thumbnail,
)
from a0_plugin_testkit.real.a0_api import audit_a0_api_usage, assert_a0_api_usage_ok
from a0_plugin_testkit.real.deps import audit_dependencies, assert_dependencies_declared
from a0_plugin_testkit.real.public_urls import (
    assert_no_naked_container_urls_in_public_response,
)
from a0_plugin_testkit.real.validator import assert_validator_clean, static_validate

pytestmark = pytest.mark.component


def test_no_typo_extension_points(plugin_dir: Path) -> None:
    assert_no_stray_extension_folders(plugin_dir)


def test_mount_at_real_surface(plugin_dir: Path) -> None:
    """The toolbar button mounts at A0's real chat-top-end breakpoint."""
    assert_extension_at_surface(plugin_dir, "chat-top-end", pattern="*.html")


def test_no_dead_hooks(plugin_dir: Path) -> None:
    assert_no_dead_plugin_hooks(plugin_dir)


def test_thumbnail(plugin_dir: Path) -> None:
    assert_plugin_has_thumbnail(plugin_dir)


def test_static_validator(plugin_dir: Path) -> None:
    assert_validator_clean(static_validate(plugin_dir), allow_warnings=False)


def test_dependencies_declared(plugin_dir: Path) -> None:
    assert_dependencies_declared(audit_dependencies(plugin_dir))


def test_a0_api_usage_valid(plugin_dir: Path) -> None:
    assert_a0_api_usage_ok(audit_a0_api_usage(plugin_dir))


def test_no_container_urls_leaked(plugin_dir: Path) -> None:
    assert_no_naked_container_urls_in_public_response(plugin_dir)


# ── API auth posture (a0 ApiHandler policy) ──────────────────────────────────


def test_api_handler_auth_posture(plugin_dir: Path) -> None:
    """comments.py must use A0's default session-auth posture.

    Design: session + CSRF protected, NOT api-key gated (the browser store
    calls it via callJsonApi with session cookies). Overriding requires_auth
    to False or requires_api_key to True would be a security/behaviour break.
    """
    src = (plugin_dir / "api" / "comments.py").read_text()
    assert "requires_auth" not in src, (
        "comments.py overrides requires_auth — default (True) is the design"
    )
    assert "requires_csrf" not in src, (
        "comments.py overrides requires_csrf — default (True) is the design"
    )
    assert "requires_api_key" not in src, (
        "comments.py overrides requires_api_key — default (False) is the design"
    )
