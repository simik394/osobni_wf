# questDiscov MVP - Work Breakdown Structure

> **Status**: ✅ Complete  
> **Total Estimate**: 4 days (~32 hours)
> **Completed**: 2025-12-19

## WBS

### 1. Project Setup (0.5 day) ✅

- [x] **1.1** Create project directory structure
- [x] **1.2** Initialize `pyproject.toml` with dependencies
- [x] **1.3** Set up `.env.example` with required variables
- [x] **1.4** Create README.md with setup instructions
- [x] **1.5** Verify FalkorDB connection (reuse rsrch docker-compose)

---

### 2. Graph Module (0.5 day) ✅

- [x] **2.1** Implement `src/graph.py`
  - [x] 2.1.1 `QuestionGraph.__init__()` - FalkorDB connection
  - [x] 2.1.2 `add_question()` - Create Question node
  - [x] 2.1.3 `add_dependency()` - Create DEPENDS_ON edge
  - [x] 2.1.4 `get_all_questions()` - Query all nodes
  - [x] 2.1.5 `get_dependencies()` - Query all edges
  - [x] 2.1.6 `mark_answered()` - Update answered property
  - [x] 2.1.7 `get_unanswered()` - Filter query
- [x] **2.2** Write `tests/test_graph.py`
- [x] **2.3** Verify tests pass

---

### 3. Algorithms Module (0.5 day) ✅

- [x] **3.1** Implement `src/algorithms.py`
  - [x] 3.1.1 `build_networkx_graph()` - Convert FalkorDB → NetworkX
  - [x] 3.1.2 `topological_sort()` - Kahn's algorithm
  - [x] 3.1.3 `compute_betweenness_centrality()` - NetworkX wrapper
  - [x] 3.1.4 `get_ready_questions()` - Filter by satisfied deps
- [x] **3.2** Write `tests/test_algorithms.py`
- [x] **3.3** Verify tests pass

---

### 4. Priority Pipeline (0.5 day) ✅

- [x] **4.1** Implement `src/priority.py`
  - [x] 4.1.1 `estimate_entropy()` - LLM-based uncertainty
  - [x] 4.1.2 `compute_priority_score()` - Weighted sum
  - [x] 4.1.3 `rank_questions()` - Sort by score
- [x] **4.2** Write `tests/test_priority.py`
- [x] **4.3** Verify tests pass

---

### 5. LangGraph Agent (1 day) ✅

- [x] **5.1** Implement `src/tools/graph_tools.py`
  - [x] 5.1.1 `query_graph` tool
  - [x] 5.1.2 `add_question` tool
  - [x] 5.1.3 `add_dependency` tool
- [x] **5.2** Implement `src/tools/priority_tools.py`
  - [x] 5.2.1 `compute_priorities` tool
  - [x] 5.2.2 `get_top_questions` tool
- [x] **5.3** Implement `src/tools/obsidian_tools.py`
  - [x] 5.3.1 `read_note` tool
  - [x] 5.3.2 `write_priorities` tool
- [x] **5.4** Implement `src/agent.py`
  - [x] 5.4.1 `create_questDiscov_agent()` - ReAct agent
  - [x] 5.4.2 System prompt for research strategist
- [x] **5.5** Write `tests/test_agent.py`
- [x] **5.6** Verify tests pass

---

### 6. CLI Interface (0.5 day) ✅

- [x] **6.1** Implement `src/cli.py`
  - [x] 6.1.1 `prioritize` command
  - [x] 6.1.2 `add` command
  - [x] 6.1.3 `answer` command
  - [x] 6.1.4 `chat` command
  - [x] 6.1.5 `status` command
- [x] **6.2** Test CLI manually
- [x] **6.3** Update `pyproject.toml` scripts entry

---

### 7. Obsidian Integration (0.5 day) ✅

- [x] **7.1** Test Obsidian Local REST API connection
- [x] **7.2** Implement priority markdown formatting
- [x] **7.3** Implement note reading
- [x] **7.4** End-to-end test: CLI → Obsidian file update

---

### 8. Documentation & Cleanup (0.5 day) ✅

- [x] **8.1** Update README.md with usage examples
- [x] **8.2** Document environment variables
- [x] **8.3** Add inline docstrings
- [x] **8.4** Final commit & tag v0.1.0

---

## Dependency Order

```mermaid
gantt
    title questDiscov MVP Development
    dateFormat  YYYY-MM-DD
    
    section Setup
    1. Project Setup       :a1, 2025-01-01, 0.5d
    
    section Core
    2. Graph Module        :a2, after a1, 0.5d
    3. Algorithms Module   :a3, after a2, 0.5d
    4. Priority Pipeline   :a4, after a3, 0.5d
    
    section Agent
    5. LangGraph Agent     :a5, after a4, 1d
    
    section Interface
    6. CLI Interface       :a6, after a5, 0.5d
    7. Obsidian Integration:a7, after a5, 0.5d
    
    section Finish
    8. Documentation       :a8, after a6 a7, 0.5d
```

---

## Checklist Summary

| Phase | Tasks | Hours |
|-------|-------|-------|
| 1. Setup | 5 | 4 |
| 2. Graph | 9 | 4 |
| 3. Algorithms | 6 | 4 |
| 4. Priority | 5 | 4 |
| 5. Agent | 11 | 8 |
| 6. CLI | 5 | 4 |
| 7. Obsidian | 4 | 4 |
| 8. Docs | 4 | 4 |
| **Total** | **49** | **~32** |
