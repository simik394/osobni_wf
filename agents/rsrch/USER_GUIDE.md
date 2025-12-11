# Perplexity Researcher - User Guide

> **What is this?**  
> Perplexity Researcher is a tool that automates research tasks using AI services like Perplexity AI, Google Gemini, and NotebookLM. It can search the web, generate research reports, and even create audio summaries of your research.

---

## 🚀 Getting Started

### What You'll Need
- A computer with **Docker** installed (easiest) OR Node.js 18+
- About 10 minutes for initial setup
- A Google account (for Gemini/NotebookLM features)

### Quick Setup (3 Steps)

#### Step 1: Start the Tool
```bash
# Using Docker (recommended)
docker-compose up -d
```

#### Step 2: Login to Your Accounts
The first time you use the tool, you need to log in to:
- **Perplexity.ai** (for web research)
- **Google** (for Gemini and NotebookLM)

```bash
# This opens a browser window - log in manually
rsrch auth
```

#### Step 3: Ask Your First Question
```bash
rsrch query "What is the capital of France?"
```

That's it! You should see an answer appear.

---

## 📖 Common Tasks

### Ask a Simple Question
```bash
rsrch query "Your question here"
```
The tool searches the web and gives you an answer with sources.

### Deep Research Mode
For complex topics that need more thorough research:
```bash
rsrch query "Explain the causes of climate change" --deep
```
This takes longer but provides more comprehensive answers.

### Continue a Conversation
Keep asking follow-up questions in the same session:
```bash
# Start a named session
rsrch query "What is France?" --session="france-research"

# Ask follow-up (uses same session)
rsrch query "What is its population?" --session="france-research"
```

### Generate Audio Summary (NotebookLM)
Turn your research into a podcast-style audio overview:
```bash
# Create a notebook first
rsrch notebook create "My Research Topic"

# Add sources
rsrch notebook add-source --url="https://example.com/article"

# Generate audio overview
rsrch notebook audio --notebook "My Research Topic"
```

### Gemini Research (Google)
Use Google's Gemini for deep research and document creation:

```bash
# Start a Deep Research task (Thinking Model + Search)
rsrch gemini deep-research "Future of Quantum Computing"

# List your recent Gemini sessions
rsrch gemini list-sessions

# Export a research chat to a Google Doc
rsrch gemini export-to-docs <session-id>

# Continue a chat in an existing session
rsrch gemini send-message <session-id> "Elaborate on point 3"
```

---

## 🔧 Troubleshooting

### "Not logged in" Error
Run `rsrch auth` and log in through the browser window.

### Slow Responses
Deep research takes time (2-5 minutes). For faster answers, don't use `--deep`.

### "Browser not found"
Make sure Docker is running: `docker-compose up -d`

---

## 📚 More Help

For technical details and API documentation, see [[API|API.md]].

For developers and advanced usage, see [[AGENTS|AGENTS.md]].
