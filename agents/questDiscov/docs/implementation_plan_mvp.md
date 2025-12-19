# questDiscov MVP Implementation Plan

> **Status**: Draft  
> **Created**: 2025-12-19  
> **Stack**: Python + LangGraph + FalkorDB + Windmill + Obsidian

## 1. Overview

A **Minimal Viable Product** for the questDiscov agent that demonstrates the core value proposition:
> "Given a research problem and a set of notes, automatically identify and prioritize the next most valuable question to answer."

### MVP Scope

From the 17 features proposed, the MVP focuses on **6 essential features**:

| Feature | MVP Version |
|---------|-------------|
| **F-001** Knowledge Graph | Simple NetworkX/FalkorDB graph of questions + dependencies |
| **F-010** Topological Sorting | Basic Kahn's algorithm for valid question order |
| **F-011** Centrality (simplified) | Betweenness centrality only |
| **F-023** Priority Pipeline | Entropy × Centrality scoring (no VoI, no Monte Carlo) |
| **F-040** Planner-Executor-Critic | LangGraph ReAct agent with 3 tools |
| **F-050** Obsidian Integration | Read notes via Local REST API, write priorities |

### Deferred to v2

- F-002: Entity extraction (manual graph building for MVP)
- F-012: Critical path / PERT / Monte Carlo
- F-020/F-021: Full uncertainty/VoI calculations
- F-030: LLM hypothesis generation (agent can ask LLM ad-hoc)
- F-031/F-032: GNN and RL (requires ML infrastructure)
- F-041: GraphRAG (complex indexing)
- F-042: AI Scientist loop
- F-051: Windmill full integration (MVP uses CLI, later adds flows)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│                                                                  │
│   Obsidian Vault                      CLI                        │
│   ┌──────────────┐                    questDiscov prioritize     │
│   │ Research     │                    questDiscov add-question   │
│   │ Priorities.md│◄───────────────────questDiscov status         │
│   └──────────────┘                                               │
├─────────────────────────────────────────────────────────────────┤
│                      LANGGRAPH AGENT                             │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    ReAct Agent                           │   │
│   │  ┌─────────┐    ┌─────────┐    ┌─────────┐             │   │
│   │  │ Planner │───►│ Execute │───►│ Reflect │──┐          │   │
│   │  └─────────┘    └─────────┘    └─────────┘  │          │   │
│   │       ▲                                      │          │   │
│   │       └──────────────────────────────────────┘          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                       TOOLS                              │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│   │  │ graph_query  │  │ compute_     │  │ obsidian_    │  │   │
│   │  │              │  │ priorities   │  │ read/write   │  │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│   └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                      KNOWLEDGE GRAPH                             │
│                                                                  │
│   FalkorDB (reuse from rsrch)                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  (:Question {id, text, answered, entropy, centrality})  │   │
│   │  (:Question)-[:DEPENDS_ON]->(:Question)                 │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Proposed Changes

### 3.1 Project Structure

#### [NEW] agents/questDiscov/

```
agents/questDiscov/
├── docs/
│   └── features/          # Already exists (17 features)
├── src/
│   ├── __init__.py
│   ├── cli.py             # Typer CLI
│   ├── graph.py           # FalkorDB graph operations
│   ├── algorithms.py      # Topological sort, centrality
│   ├── priority.py        # Priority pipeline
│   ├── agent.py           # LangGraph ReAct agent
│   └── tools/
│       ├── __init__.py
│       ├── graph_tools.py     # query_graph, add_question, add_dependency
│       ├── priority_tools.py  # compute_priorities, get_top_questions
│       └── obsidian_tools.py  # read_note, write_priorities
├── tests/
│   ├── test_graph.py
│   ├── test_algorithms.py
│   └── test_agent.py
├── pyproject.toml
├── README.md
└── .env.example
```

---

### 3.2 Core Modules

#### [NEW] src/graph.py

```python
"""FalkorDB graph operations for questDiscov."""
from falkordb import FalkorDB

class QuestionGraph:
    """Manages question/dependency graph in FalkorDB."""
    
    def __init__(self, host='localhost', port=6379):
        self.db = FalkorDB(host=host, port=port)
        self.graph = self.db.select_graph('questDiscov')
    
    def add_question(self, id: str, text: str, answered: bool = False) -> None:
        """Add a research question node."""
        
    def add_dependency(self, q_from: str, q_to: str) -> None:
        """Create DEPENDS_ON edge (q_from depends on q_to)."""
        
    def get_all_questions(self) -> list[dict]:
        """Return all questions with properties."""
        
    def get_dependencies(self) -> list[tuple[str, str]]:
        """Return all dependency edges."""
        
    def mark_answered(self, question_id: str) -> None:
        """Mark a question as answered."""
        
    def get_unanswered(self) -> list[dict]:
        """Get all unanswered questions."""
```

---

#### [NEW] src/algorithms.py

```python
"""Graph algorithms for question prioritization."""
import networkx as nx

def build_networkx_graph(questions: list, dependencies: list) -> nx.DiGraph:
    """Convert FalkorDB data to NetworkX for algorithm execution."""
    
def topological_sort(graph: nx.DiGraph) -> list[str]:
    """Return questions in valid dependency order using Kahn's algorithm."""
    
def compute_betweenness_centrality(graph: nx.DiGraph) -> dict[str, float]:
    """Compute betweenness centrality for all nodes."""
    
def get_ready_questions(graph: nx.DiGraph, answered: set[str]) -> list[str]:
    """Return questions with all dependencies satisfied."""
```

---

#### [NEW] src/priority.py

```python
"""Priority scoring pipeline (simplified for MVP)."""

def estimate_entropy(question: dict, llm_client) -> float:
    """Use LLM to estimate uncertainty (0-1) for a question."""
    # Prompt: "How uncertain is the answer to this question? Reply 0-1."
    
def compute_priority_score(
    question: dict,
    centrality: float,
    entropy: float,
    weights: dict = {'entropy': 0.5, 'centrality': 0.5}
) -> float:
    """Compute composite priority score."""
    return weights['entropy'] * entropy + weights['centrality'] * centrality

def rank_questions(questions: list, scores: dict) -> list[dict]:
    """Return questions sorted by priority score descending."""
```

---

#### [NEW] src/agent.py

```python
"""LangGraph ReAct agent for question prioritization."""
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from .tools.graph_tools import query_graph, add_question, add_dependency
from .tools.priority_tools import compute_priorities, get_top_questions
from .tools.obsidian_tools import read_note, write_priorities

def create_questDiscov_agent():
    """Create the LangGraph agent with tools."""
    
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    tools = [
        query_graph,
        add_question,
        add_dependency,
        compute_priorities,
        get_top_questions,
        read_note,
        write_priorities,
    ]
    
    system_prompt = """You are a research question strategist.
    Your goal is to help the user identify the highest-value questions to answer next.
    
    You have access to a knowledge graph of research questions and their dependencies.
    Use your tools to:
    1. Query the current state of research questions
    2. Compute priorities based on uncertainty and structural importance
    3. Read context from Obsidian notes
    4. Write prioritized questions back to Obsidian
    
    Always explain your reasoning."""
    
    agent = create_react_agent(llm, tools, state_modifier=system_prompt)
    return agent
```

---

#### [NEW] src/cli.py

```python
"""CLI interface for questDiscov."""
import typer
from rich.console import Console
from .agent import create_questDiscov_agent
from .graph import QuestionGraph

app = typer.Typer(name="questDiscov")
console = Console()

@app.command()
def prioritize(top: int = 5, obsidian: bool = True):
    """Compute and display top priority questions."""
    
@app.command()
def add(text: str, depends_on: list[str] = None):
    """Add a new research question."""
    
@app.command()
def answer(question_id: str):
    """Mark a question as answered."""
    
@app.command()
def chat(query: str):
    """Chat with the agent about your research."""

@app.command()
def status():
    """Show graph statistics."""

if __name__ == "__main__":
    app()
```

---

### 3.3 Dependencies

#### [NEW] pyproject.toml

```toml
[project]
name = "questDiscov"
version = "0.1.0"
description = "Research question prioritization agent"
requires-python = ">=3.11"

dependencies = [
    "langgraph>=0.2.0",
    "langchain-openai>=0.2.0",
    "falkordb>=1.0.0",
    "networkx>=3.0",
    "typer>=0.12.0",
    "rich>=13.0",
    "httpx>=0.27.0",  # For Obsidian REST API
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
]

[project.scripts]
questDiscov = "questDiscov.cli:app"
```

---

### 3.4 LangGraph Tools

#### [NEW] src/tools/graph_tools.py

```python
from langchain_core.tools import tool
from ..graph import QuestionGraph

@tool
def query_graph(cypher_query: str) -> str:
    """Execute a Cypher query on the question graph. Returns JSON results."""
    
@tool
def add_question(question_id: str, text: str) -> str:
    """Add a new research question to the graph."""
    
@tool  
def add_dependency(from_question: str, to_question: str) -> str:
    """Add a dependency: from_question DEPENDS_ON to_question."""
```

#### [NEW] src/tools/priority_tools.py

```python
@tool
def compute_priorities() -> str:
    """Compute priority scores for all unanswered questions.
    Returns JSON with question IDs and scores."""
    
@tool
def get_top_questions(n: int = 5) -> str:
    """Get top N highest priority questions with explanations."""
```

#### [NEW] src/tools/obsidian_tools.py

```python
@tool
def read_note(path: str) -> str:
    """Read a note from Obsidian vault via Local REST API."""
    
@tool
def write_priorities(markdown_content: str) -> str:
    """Write priority list to Research_Priorities.md in Obsidian."""
```

---

## 4. Verification Plan

### 4.1 Unit Tests

#### Test Graph Operations

```bash
cd agents/questDiscov
pytest tests/test_graph.py -v
```

Tests:
- `test_add_question`: Add question, verify node exists
- `test_add_dependency`: Add edge, verify relationship
- `test_mark_answered`: Update answered status
- `test_get_unanswered`: Filter by answered=false

#### Test Algorithms

```bash
pytest tests/test_algorithms.py -v
```

Tests:
- `test_topological_sort_valid`: Sort DAG, verify order respects deps
- `test_topological_sort_cycle`: Detect cycle, raise error
- `test_betweenness_centrality`: Compare vs known values
- `test_get_ready_questions`: Correctly filter by satisfied deps

### 4.2 Integration Test

#### Test Agent Interaction

```bash
pytest tests/test_agent.py -v
```

Tests:
- `test_agent_prioritizes`: Agent can compute and return priorities
- `test_agent_adds_question`: Agent can add question via tool
- `test_agent_explains_reasoning`: Agent provides rationale

### 4.3 Manual Verification

1. **Start FalkorDB**
   ```bash
   docker compose -f agents/rsrch/docker-compose.yml up falkordb -d
   ```

2. **Add sample questions**
   ```bash
   questDiscov add "What is the optimal temperature for reaction X?"
   questDiscov add "Does catalyst A improve yield?" --depends-on Q1
   questDiscov add "What is the mechanism of reaction X?" --depends-on Q1
   questDiscov status
   ```

3. **Compute priorities**
   ```bash
   questDiscov prioritize --top=3
   ```
   Expected: Q1 should be highest priority (blocks others)

4. **Chat with agent**
   ```bash
   questDiscov chat "What should I work on next and why?"
   ```
   Expected: Agent explains Q1 priority based on centrality

5. **Obsidian integration** (requires Local REST API plugin)
   ```bash
   questDiscov prioritize --obsidian
   ```
   Check: `Research_Priorities.md` created/updated in vault

---

## 5. Future: Windmill Integration

After MVP works via CLI, add Windmill flows:

```
f/questDiscov/
├── daily_prioritize.flow.ts    # Schedule: Update priorities daily
├── ingest_obsidian.flow.ts     # Webhook: Process new notes
└── research_session.flow.ts    # On-demand: Full research cycle
```

This is deferred to v1.1 after core agent is validated.

---

## 6. Effort Estimate

| Component | Effort |
|-----------|--------|
| Graph module | 0.5 day |
| Algorithms module | 0.5 day |
| Priority pipeline | 0.5 day |
| LangGraph agent + tools | 1 day |
| CLI | 0.5 day |
| Tests | 0.5 day |
| Obsidian integration | 0.5 day |
| **Total MVP** | **~4 days** |

---

## 7. Open Questions for User

1. **LLM provider**: Use OpenAI API or local model (Ollama)?
2. **Vault path**: What is the Obsidian vault path for priorities?
3. **Nomad deployment**: Should MVP include Nomad job file, or Docker Compose first?
