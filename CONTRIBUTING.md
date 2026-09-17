# Contributing to Chat Comments

Thanks for helping improve the Chat Comments plugin for Agent Zero.

## Repo layout

- Repo root — the plugin itself (root layout, `.devkit.yml` `plugin_dir: .`): API handler, webui store/modal, extension mount.
- `docs/spec/` — the four living BDD docs (`behaviour-spec.md`, `implementation-plan.md`, `e2e.feature.md`, `e2e-steps-spec.md`). Behaviour changes MUST update these.
- `tests/` — L1 testkit shape suite (`pytest`) + L3 Playwright BDD (`tests/e2e/`).
- `tests/_testkit/` — the plugin devkit (git submodule). Never edit here; contribute upstream.

## Dev setup

```bash
git clone --recursive https://github.com/agent-zero-plugins/agent-zero-plugin-chat-comments
cd agent-zero-plugin-chat-comments
pip install pytest pyyaml
pytest              # L1 shape suite
make verify         # Tier-1 static BDD gates (feature-purity, honesty, traceability)
make bdd-e2e        # full local e2e loop (needs podman/docker)
```

## Rules

1. **Behaviour first.** New behaviour = new `BEH-n` in `docs/spec/behaviour-spec.md` + scenario in `tests/e2e/features/` + step bindings. The CI gates enforce traceability.
2. **No implementation leakage in `.feature` files.** Selectors/stores/API calls live in `tests/e2e/steps/` only.
3. **Version bumps in lockstep**: `plugin.yaml`, `meta.yaml`, and `pyproject.toml` must agree.
4. **Run `make verify` before pushing** — same gates as CI.
5. PRs target `main`. CI (`plugin-e2e`) must be green; the publish gate refuses unverified commits.

## License

By contributing you agree your contributions are licensed under Apache-2.0.
