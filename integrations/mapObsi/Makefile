# mapObsi - Obsidian Vault Metadata Mapper
# Usage: make scan VAULT=path/to/subvault

SHELL := /bin/bash
.DEFAULT_GOAL := scan

# Configuration
VAULT ?= .
OUTPUT_DIR := output
SCRIPTS := scripts
CACHE_FILE := $(OUTPUT_DIR)/.last_scan

# Python
PYTHON := python3

# Colors
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m

.PHONY: scan full json csv sqlite orphans broken clean help

## scan: Scan changed files only (default)
scan: $(OUTPUT_DIR) detect
	@echo -e "$(GREEN)Scanning changed files in: $(VAULT)$(NC)"
	@$(SCRIPTS)/detect_changes.sh "$(VAULT)" | $(PYTHON) $(SCRIPTS)/scan.py --output $(OUTPUT_DIR)/notes.json
	@date +%s > $(CACHE_FILE)
	@echo -e "$(GREEN)Done! Output: $(OUTPUT_DIR)/notes.json$(NC)"

## full: Full vault rescan (ignore cache)
full: $(OUTPUT_DIR)
	@echo -e "$(YELLOW)Full rescan of: $(VAULT)$(NC)"
	@find "$(VAULT)" -name "*.md" -type f | $(PYTHON) $(SCRIPTS)/scan.py --output $(OUTPUT_DIR)/notes.json --full
	@date +%s > $(CACHE_FILE)
	@echo -e "$(GREEN)Done! Output: $(OUTPUT_DIR)/notes.json$(NC)"

## detect: Show which files would be scanned
detect:
	@$(SCRIPTS)/detect_changes.sh "$(VAULT)" | head -20
	@echo "..."

## json: Output as JSON (default)
json: scan

## csv: Output as CSV
csv: $(OUTPUT_DIR)
	@$(PYTHON) $(SCRIPTS)/output.py --input $(OUTPUT_DIR)/notes.json --format csv --output $(OUTPUT_DIR)/notes.csv
	@echo -e "$(GREEN)CSV: $(OUTPUT_DIR)/notes.csv$(NC)"

## sqlite: Output as SQLite database
sqlite: $(OUTPUT_DIR)
	@$(PYTHON) $(SCRIPTS)/output.py --input $(OUTPUT_DIR)/notes.json --format sqlite --output $(OUTPUT_DIR)/vault.db
	@echo -e "$(GREEN)SQLite: $(OUTPUT_DIR)/vault.db$(NC)"

## orphans: List notes with no backlinks
orphans: scan
	@$(PYTHON) $(SCRIPTS)/scan.py --orphans $(OUTPUT_DIR)/notes.json

## broken: List broken wikilinks
broken: scan
	@$(PYTHON) $(SCRIPTS)/scan.py --broken $(OUTPUT_DIR)/notes.json

## clean: Remove generated files
clean:
	@rm -rf $(OUTPUT_DIR)/*
	@echo "Cleaned output directory"

## help: Show this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## //' | column -t -s ':'

$(OUTPUT_DIR):
	@mkdir -p $(OUTPUT_DIR)
