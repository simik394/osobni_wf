# Research Question Generation System - Feature Index

> **Source**: [Strategie Generování Výzkumných Otázek](file:///home/sim/Obsi/Prods/01-pwf/flows/questDiscov/Strategie%20Generov%C3%A1n%C3%AD%20V%C3%BDzkumn%C3%BDch%20Ot%C3%A1zek_%20Od%20Algoritm%C5%AF%20po%20Neuro-symbolickou%20AI.txt)  
> **Created**: 2025-12-19  
> **Status**: Draft Proposals

## Overview

This directory contains feature proposals extracted from the vision document for an automated research question generation system. The system aims to optimize the process of solving "epic problems" through intelligent question prioritization and knowledge graph-based analysis.

## Core Objective

Transform chaotic, high-entropy research problems into structured, navigable knowledge spaces by:
1. Representing knowledge as a graph (DAG) of dependencies
2. Applying mathematical optimization to select highest-value questions
3. Combining neural (LLM/GNN) and symbolic (graph algorithms) approaches
4. Automating the feedback loop between exploration and execution

---

## Feature Categories

### 🏗️ Infrastructure (Foundation)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-001 | [[F-001_knowledge_graph_foundation\|Knowledge Graph Foundation]] | High | Draft | Graph-based storage for entities, hypotheses, relationships |
| F-002 | [[F-002_entity_relationship_extraction\|Entity & Relationship Extraction]] | High | Draft | LLM-powered extraction from documents |

---

### 📊 Graph Analysis (Structural Intelligence)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-010 | [[F-010_topological_sorting\|Topological Sorting & DAG Analysis]] | High | Draft | Kahn's algorithm, dependency sequencing |
| F-011 | [[F-011_centrality_metrics\|Centrality Metrics]] | High | Draft | Betweenness, information centrality for node importance |
| F-012 | [[F-012_critical_path_analysis\|Critical Path Analysis]] | Medium | Draft | CPM/PERT for probabilistic scheduling |

---

### 🎯 Prioritization (Decision Intelligence)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-020 | [[F-020_uncertainty_sampling\|Entropy/Uncertainty Sampling]] | High | Draft | Active learning via maximum entropy selection |
| F-021 | [[F-021_value_of_information\|Value of Information Calculation]] | High | Draft | Bayesian VoI for question prioritization |
| F-022 | [[F-022_monte_carlo_simulation\|Monte Carlo Simulation]] | Medium | Draft | Criticality indices, risk assessment |
| F-023 | [[F-023_question_priority_pipeline\|Question Priority Pipeline]] | High | Draft | Composite scoring: entropy × centrality × criticality |

---

### 🤖 AI/ML (Neural Intelligence)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-030 | [[F-030_llm_hypothesis_generation\|LLM Hypothesis Generation]] | High | Draft | Chain-of-Thought, problem decomposition |
| F-031 | [[F-031_gnn_link_prediction\|GNN Link Prediction]] | Medium | Draft | GraphSAGE/GAT for relationship discovery |
| F-032 | [[F-032_rl_graph_navigation\|RL Graph Navigation]] | Low | Draft | Multi-hop reasoning with HRL |

---

### 🧠 Neuro-Symbolic Architecture (Integration)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-040 | [[F-040_planner_executor_critic\|Planner-Executor-Critic Framework]] | High | Draft | Agent architecture with symbolic constraints |
| F-041 | [[F-041_graphrag\|GraphRAG Contextualization]] | High | Draft | Community detection, hierarchical summarization |
| F-042 | [[F-042_ai_scientist_loop\|AI Scientist Loop]] | Low | Draft | Automated idea generation & peer review |

---

### 🔗 Integrations (Ecosystem)

| ID | Feature | Priority | Status | Spec |
|----|---------|----------|--------|------|
| F-050 | [[F-050_obsidian_integration\|Obsidian PKM Integration]] | High | Draft | Local REST API, Dataview, Smart Connections |
| F-051 | [[F-051_windmill_orchestration\|Windmill Orchestration]] | Medium | Draft | TypeScript/Python flows, Nomad deployment |

---

## Priority Legend

| Priority | Meaning | Criteria |
|----------|---------|----------|
| **High** | Essential | Core value proposition, blocks other features |
| **Medium** | Important | Significant enhancement, can be parallel development |
| **Low** | Nice-to-have | Advanced capability, future phase |

## Implementation Order

```mermaid
graph TD
    F001[F-001: Knowledge Graph] --> F002[F-002: Entity Extraction]
    F001 --> F010[F-010: Topological Sort]
    F001 --> F011[F-011: Centrality]
    
    F002 --> F041[F-041: GraphRAG]
    F010 --> F012[F-012: Critical Path]
    F011 --> F020[F-020: Uncertainty]
    F011 --> F021[F-021: VoI]
    
    F020 --> F023[F-023: Priority Pipeline]
    F021 --> F023
    F012 --> F023
    
    F023 --> F030[F-030: LLM Generation]
    F030 --> F040[F-040: Planner-Executor-Critic]
    F041 --> F040
    
    F040 --> F050[F-050: Obsidian]
    F040 --> F051[F-051: Windmill]
    
    F031[F-031: GNN] -.-> F020
    F032[F-032: RL] -.-> F030
    F042[F-042: AI Scientist] -.-> F040
```

## Cost-Benefit Summary

| Approach | Setup Cost | Runtime Cost | Best For |
|----------|------------|--------------|----------|
| Pure Algorithmic (Graph) | High (ontology design) | Low (CPU) | Structured domains |
| Pure LLM (API) | Low (prompt engineering) | High (token costs) | Exploration, generation |
| Hybrid Neuro-Symbolic | Highest | Optimized | Epic problems, production |

---

## Next Steps

1. Review and prioritize feature proposals
2. Identify dependencies between features
3. Create implementation roadmap
4. Begin with F-001 (Knowledge Graph Foundation)
