# Makefile for a new agent-zero plugin source repo
# Delegates skill / prompt / instruction / MCP / testkit linking to the
# .skills submodule (agent-zero-plugins-skills).
#
# After cloning from this template:
#   1. Rename the `my_plugin/` directory to your plugin name.
#   2. Update PLUGIN_NAME below to match.
#   3. Fill in my_plugin/plugin.yaml, __init__.py, default_config.yaml.
#   4. Run `make link-all` to set up IDE skill symlinks + testkit.
#   5. Author tests under tests/ using a0_plugin_testkit.

.PHONY: help link-skills unlink-skills list-skills link-prompts unlink-prompts \
        link-instructions unlink-instructions link-mcp unlink-mcp list-mcp \
        link-workflows unlink-workflows link-testkit unlink-testkit \
        link-all update-skills plugin-zip plugin-clean plugin-info test

SKILLS_SUBMODULE := .skills

# ── Plugin packaging ─────────────────────────────────────────────────────────
# Replace `my_plugin` with your actual plugin name after cloning.
PLUGIN_NAME    := my_plugin
PLUGIN_SRC     := $(PLUGIN_NAME)
PLUGIN_VERSION := $(shell awk '/^version:/ {gsub(/[\"'"'"' ]/,"",$$2); print $$2}' $(PLUGIN_SRC)/plugin.yaml 2>/dev/null || echo '0.0.0')
DIST           := dist
ZIP_NAME       := $(PLUGIN_NAME)-$(PLUGIN_VERSION).zip
ZIP_PATH       := $(DIST)/$(ZIP_NAME)

help:
	@echo "Plugin packaging:"
	@echo "  plugin-zip          Build dist/$(ZIP_NAME) for gate-repo submission"
	@echo "  plugin-info         Show plugin name + version + output path"
	@echo "  plugin-clean        Remove dist/"
	@echo ""
	@echo "Skills / testkit (via .skills submodule):"
	@echo "  link-skills         Link all skills into this repo"
	@echo "  unlink-skills       Remove all skill symlinks"
	@echo "  list-skills         List all discovered skills"
	@echo "  link-prompts        Link all prompts (slash commands)"
	@echo "  unlink-prompts      Remove all prompt symlinks"
	@echo "  link-instructions   Link all instructions (path rules)"
	@echo "  unlink-instructions Remove all instruction symlinks"
	@echo "  link-mcp            Merge MCP server configs into this repo"
	@echo "  unlink-mcp          Remove managed MCP servers"
	@echo "  list-mcp            List discovered MCP configs"
	@echo "  link-workflows      Install the skills-sync caller workflow"
	@echo "  unlink-workflows    Remove the skills-sync caller workflow"
	@echo "  link-testkit        Symlink testkit at tests/_testkit"
	@echo "  unlink-testkit      Remove the testkit symlink"
	@echo "  link-all            Link skills, prompts, instructions, MCP, workflows, testkit"
	@echo "  update-skills       Pull latest skills, relink, stage submodule ref"

# ── Skills submodule delegation ──────────────────────────────────────────────

link-skills:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-skills PARENT_ROOT=$(CURDIR)

unlink-skills:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-skills PARENT_ROOT=$(CURDIR)

list-skills:
	$(MAKE) -C $(SKILLS_SUBMODULE) list-skills PARENT_ROOT=$(CURDIR)

link-prompts:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-prompts PARENT_ROOT=$(CURDIR)

unlink-prompts:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-prompts PARENT_ROOT=$(CURDIR)

link-instructions:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-instructions PARENT_ROOT=$(CURDIR)

unlink-instructions:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-instructions PARENT_ROOT=$(CURDIR)

link-mcp:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-mcp PARENT_ROOT=$(CURDIR)

unlink-mcp:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-mcp PARENT_ROOT=$(CURDIR)

list-mcp:
	$(MAKE) -C $(SKILLS_SUBMODULE) list-mcp PARENT_ROOT=$(CURDIR)

link-workflows:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-workflows PARENT_ROOT=$(CURDIR)

unlink-workflows:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-workflows PARENT_ROOT=$(CURDIR)

link-testkit:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-testkit PARENT_ROOT=$(CURDIR)

unlink-testkit:
	$(MAKE) -C $(SKILLS_SUBMODULE) unlink-testkit PARENT_ROOT=$(CURDIR)

link-all:
	$(MAKE) -C $(SKILLS_SUBMODULE) link-all PARENT_ROOT=$(CURDIR)

update-skills:
	@echo "[skills] Updating skills submodule..."
	@cd $(SKILLS_SUBMODULE) && git checkout main && git pull origin main
	@$(MAKE) -C $(SKILLS_SUBMODULE) unlink-skills PARENT_ROOT=$(CURDIR) 2>/dev/null || true
	@$(MAKE) -C $(SKILLS_SUBMODULE) link-skills PARENT_ROOT=$(CURDIR)
	@git add $(SKILLS_SUBMODULE)
	@echo
	@echo "[skills] Submodule updated and relinked. Run 'git commit' when ready."

# ── Plugin zip (for gate-repo submission) ────────────────────────────────────

plugin-info:
	@echo "Plugin name:     $(PLUGIN_NAME)"
	@echo "Plugin version:  $(PLUGIN_VERSION)"
	@echo "Output path:     $(ZIP_PATH)"

plugin-zip:
	@mkdir -p "$(DIST)"
	@rm -f "$(ZIP_PATH)"
	@echo "[zip] Building $(ZIP_NAME)..."
	@cd $(CURDIR) && zip -r "$(ZIP_PATH)" "$(PLUGIN_SRC)/" \
		-x "*.pyc" -x "*/__pycache__/*" -x "*/.git/*" \
		-x "*/node_modules/*" -x "*.so" -x "*.dylib" -x "*.dll" \
		-x "*.zip"
	@echo "[zip] Done: $(ZIP_PATH)"
	@echo "[zip] Next: PR plugins/$(PLUGIN_NAME).zip + plugins/$(PLUGIN_NAME).meta.yaml"
	@echo "[zip]       to agent-zero-plugins/agent-zero-vendor-plugins"

plugin-clean:
	@rm -rf "$(DIST)"
	@echo "[clean] Removed $(DIST)/"

# ── Tests ────────────────────────────────────────────────────────────────────

test:
	@pytest -q
