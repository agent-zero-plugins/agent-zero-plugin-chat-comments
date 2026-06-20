"""my_plugin — Agent Zero plugin entry point.

Replace this docstring + the stub implementations below with your plugin's
actual extension points (tools, extensions, hooks). See:

- `a0-plugin-router` skill — choose a tool / extension / hook shape.
- `a0-create-plugin` skill — authoring conventions.
- `plugin-manifest-contract` skill — secrets hygiene rules CI enforces.
"""

import os

# ── Non-secret config (operator-tunable via env vars) ────────────────────────
# Cascade: operator env > A0 UI config.json > default_config.yaml > literal.
# Convention: env-var names prefixed with the plugin name (CAPS_SNAKE_CASE)
# to avoid collisions with other plugins running in the same A0 process.

POLLING_INTERVAL_SECONDS = int(os.getenv("MY_PLUGIN_POLLING_INTERVAL_SECONDS", "60"))


# ── Secrets (operator pushes via the chart's per-plugin secrets: block) ──────
# Secrets are read from env vars ONLY. They must NEVER appear in:
#   - default_config.yaml  (publicly readable inside the zip)
#   - A0's UI config.json  (operator-editable; not a credential channel)
#   - <input type="password"> in webui/  (rejected by the gate's CI)
#
# Uncomment + adapt when your plugin needs a credential:
#
# def _api_key() -> str:
#     key = os.getenv("MY_PLUGIN_API_KEY")
#     if not key:
#         raise RuntimeError("MY_PLUGIN_API_KEY env var is required")
#     return key


# ── Plugin entry point ───────────────────────────────────────────────────────
# Agent Zero discovers tools / extensions / hooks from this module's public
# names. Implement at least one of:
#
# - A `Tool` subclass    → exposes a callable tool to the agent
# - An extension hook    → modifies A0 behaviour at a well-known extension point
# - A lifecycle hook     → runs on plugin enable/disable/install
#
# See the a0-create-plugin skill for the framework's hook surface.

# def my_tool(...): ...
