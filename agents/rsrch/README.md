# Perplexity Researcher - Quick Start Guide

The `rsrch` agent is a powerful CLI for automated research using Perplexity, Gemini, and NotebookLM.

**🚀 [Full Command Reference (CLI.md)](./CLI.md)**

## Setup

```bash
# 1. Install
npm install && npm run build

# 2. Authenticate (Headless or VNC)
rsrch auth
```

## 🌟 Hero Workflows

### 🧠 Deep Research (Gemini)
Perform comprehensive deep research on a topic using Gemini.

```bash
# Start Deep Research
rsrch gemini deep-research "Future of Quantum Computing" --local --headed

# Export Findings to Google Docs
rsrch gemini export-to-docs --local
```

### 🎙️ Research-to-Podcast (NotebookLM)
Turn a research topic into an audio overview (podcast).

```bash
# 1. Create Notebook
rsrch notebook create "Quantum Computing Overview"

# 2. Add Sources (URL or text)
rsrch notebook add-source "https://en.wikipedia.org/wiki/Quantum_computing" --notebook "Quantum Computing Overview"
rsrch notebook add-text "Quantum Computing Overview" "Key notes..." --source-title "My Notes"

# 3. Generate Audio
rsrch notebook audio --notebook "Quantum Computing Overview" --wet

# 4. Download
rsrch notebook download-audio "quantum_podcast.mp3" --notebook "Quantum Computing Overview"
```

### 🔄 Unified Pipeline
Run the entire flow (Research -> Podcast) in one command:

```bash
rsrch unified "Impact of AI on Healthcare" --prompt "Focus on ethics"
```

### 💎 Custom Assistants (Gems)
Create and chat with specialized agents.

```bash
# Create a coding assistant Gem
rsrch gemini create-gem "CodeBuddy" --instructions "You are an expert TypeScript engineer." --local

# Chat
rsrch gemini chat-gem "CodeBuddy" "Explain standard IO in Node.js" --local
```

### 🕸️ Knowledge Graph
Track your research journey.

```bash
# View recent conversations across platforms
rsrch graph conversations --limit=5

# See lineage of an artifact (what job created this audio?)
rsrch graph lineage <AudioID>
```

## Documentation

| Document | Description |
|----------|-------------|
| [CLI.md](./CLI.md) | **Complete Command Reference** |
| [API.md](./API.md) | HTTP API Endpoints |
| [USER_GUIDE.md](./USER_GUIDE.md) | Detailed Workflows & Guides |
| [AGENTS.md](./AGENTS.md) | Integration with other Agents |
