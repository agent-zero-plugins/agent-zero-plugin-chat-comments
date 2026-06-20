# agent-zero-new-plugin-template

GitHub template for new agent-zero plugin source repos in the
[`agent-zero-plugins`](https://github.com/agent-zero-plugins) org.

A repo cloned from this template ships **skills-ready** from the first
commit: the shared skills library, the plugin-development testkit, the
manifest contract, and IDE integrations are all wired up. You replace
the `my_plugin/` placeholder with your plugin's source, author your
tests, package the zip, and PR it into
[`agent-zero-vendor-plugins`](https://github.com/agent-zero-plugins/agent-zero-vendor-plugins).

## Quick start

```bash
# 1. Create a new repo from this template
gh repo create agent-zero-plugins/agent-zero-plugin-<your-name> \
  --template agent-zero-plugins/agent-zero-new-plugin-template \
  --private \
  --clone
cd agent-zero-plugin-<your-name>

# 2. Initialise the .skills submodule + link everything
git submodule update --init -- .skills
make link-all

# 3. Rename the placeholder plugin dir to your plugin's name
git mv my_plugin <your-name>

# 4. Update PLUGIN_NAME in the Makefile + name fields in
#    <your-name>/plugin.yaml, <your-name>/meta.yaml, tests/conftest.py,
#    and pyproject.toml. Then commit + push.
```

After `make link-all`, the repo has:

| Path | What it is |
|---|---|
| `.skills/` | Submodule → `agent-zero-plugins-skills` (24 skills) |
| `tests/_testkit/` | Relative symlink → `.skills/vendor/a0-plugin-testkit/` |
| `.claude/skills/`, `.github/skills/`, `.antigravity/skills/` | Skill symlinks per IDE (24 × 3) |
| `.claude/commands/`, `.github/prompts/` | Slash-command prompts (when shared-assets/prompts/ has content) |
| `.claude/rules/`, `.github/instructions/` | Path-scoped IDE rules (when shared-assets/instructions/ has content) |
| `.vscode/mcp.json`, `.mcp.json` | Merged MCP server configs |
| `.github/workflows/skills-sync.yml` | Nightly auto-sync (bumps `.skills`, relinks, opens PR) |
| `my_plugin/` | Placeholder plugin source — rename this |
| `tests/` | Smoke test scaffold using `a0_plugin_testkit` |
| `pyproject.toml` | pytest + ruff + mypy config, with `tests/_testkit/src` on `pythonpath` |
| `Makefile` | Delegates to `.skills/Makefile`; adds `plugin-zip`, `plugin-info`, `plugin-clean` |

## Skills you get out of the box

The `.skills` submodule provides 24 skills covering everything you need
for plugin development — load any of them in your IDE:

| Group | Skill | When |
|---|---|---|
| `plugins/` | `plugin-manifest-contract` | Before you write any code — the rules the gate's CI enforces |
| `plugins/` | `author-plugin-from-template` | Using this very template |
| `plugins/` | `contribute-plugin-to-gate` | Once the plugin is built — zip + PR to the gate |
| `plugins/` | `consume-plugin-in-env` | Operator-side wiring after the gate publishes |
| `plugins/` | `rotate-plugin-credentials` | Refresh secrets without redeploying |
| `plugins/` | `troubleshoot-plugin-deployment` | When something fails to load |
| `plugins/` | `curate-vendor-plugins-gate` | Maintainer's view of incoming PRs |
| `a0/` | `a0-plugin-router` | Entry point — routes to specialist a0 skills |
| `a0/` | `a0-create-plugin` | A0 framework's plugin authoring conventions |
| `a0/` | `a0-debug-plugin` | A0's diagnostic recipes |
| `a0/` | `a0-manage-plugin` | Plugin Hub, install/update/uninstall |
| `a0/` | `a0-review-plugin` | Audit before contributing |
| `a0/` | `a0-contribute-plugin` | Community Plugin Index workflow |
| `a0/` | `a0-plugin-testkit` | Test harness reference + assertion catalogue |
| `a0/` | `a0-development` | Broader A0 framework dev |
| `org/` | `bootstrap-plugins-repo` | What this template implements |
| `org/` | `plugins-org-issue-management` | Where issues go across plugins-org repos |
| `meta-skills/` | `manage-skills` / `manage-prompts` / etc. | Operate the skills library itself |

## Step-by-step authoring flow

1. **Pick a shape**. Read [`a0-plugin-router`](.claude/skills/a0-plugin-router/SKILL.md) and decide whether your plugin is a tool, extension, or hook.
2. **Read the contract**. [`plugin-manifest-contract`](.claude/skills/plugin-manifest-contract/SKILL.md) lists the static checks the gate enforces. Internalise them before writing — retrofitting is annoying.
3. **Fill in the placeholder**. Rename `my_plugin/` and update `name:` / `version:` / `description:` in `plugin.yaml` + `meta.yaml`. Update `PLUGIN_NAME` in `Makefile`. Update the plugin dir name in `tests/conftest.py`.
4. **Implement**. Add tools / extensions / hooks to `<your-name>/__init__.py`. Use `os.getenv()` for any credentials (never `default_config.yaml`, never `<input type="password">`).
5. **Test**. `pytest` runs the smoke test out of the box. Add testkit assertions per the [`a0-plugin-testkit`](.claude/skills/a0-plugin-testkit/SKILL.md) skill.
6. **Package**. `make plugin-zip` produces `dist/<your-name>-<version>.zip`.
7. **PR to the gate**. Drop the zip + `<your-name>.meta.yaml` into `agent-zero-vendor-plugins/plugins/`, open a PR. Follow [`contribute-plugin-to-gate`](.claude/skills/contribute-plugin-to-gate/SKILL.md).

## Keeping the skills submodule fresh

The `.github/workflows/skills-sync.yml` workflow installed by
`make link-workflows` runs nightly at 03:00 UTC. It bumps the `.skills`
submodule to the latest `main`, re-runs `link-all`, and opens a PR with
auto-merge enabled.

For an on-demand refresh:

```bash
make update-skills
git commit -m 'chore: update skills submodule'
git push
```

## Differences from a forked vendor plugin

This template is for **org-owned plugin sources** — code you author from
scratch in the `agent-zero-plugins` org. If you're instead adapting an
upstream community plugin, the path is different: fork it under
`agent-zero-plugins/agent-zero-plugin-<name>`, conform it to the
manifest contract per [`plugin-manifest-contract`](.claude/skills/plugin-manifest-contract/SKILL.md),
then bootstrap the `.skills` submodule per
[`bootstrap-plugins-repo`](.claude/skills/bootstrap-plugins-repo/SKILL.md).

## License

Apache-2.0.
