# Feature Catalog - 01-pwf Project

This document provides a comprehensive overview of the features within the `01-pwf` project, categorized by component/agent, including their current implementation status.

## 🛠️ YouTrack IaC (Infrastructure as Code)
*Specific project for declarative YouTrack configuration management.*

**Detailed Catalog**: [youtrack_iac_feature_catalog.md](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/youtrack_iac_feature_catalog.md)

| Feature | Description | Status |
|:---|:---|:---|
| **Prolog Engine** | Logic-based configuration diffing and planning. | ✅ Implemented |
| **YAML Management** | Projects, Fields, Boards, and Workflows as Code. | ✅ Implemented |
| **Windmill Sync** | Automated scheduled synchronization of configuration. | ✅ Implemented |

---

## 🚀 RSRCH Agent (Research Automation)

---

## 🧭 QuestDiscov Agent (Research Planning)
*Intelligent planning and prioritization of research questions using Graph Theory.*

| Feature ID | Feature Name | Description | Status |
|:---|:---|:---|:---|
| Q-001 | **Knowledge Graph Foundation** | DAG-based storage for entities, hypotheses, and relationships. | 📝 Draft (F-001) |
| Q-002 | **Topological Analysis** | Kahn's algorithm for dependency sequencing and bottleneck detection. | 📝 Draft (F-010) |
| Q-003 | **Centrality Metrics** | Identifying "Critical" questions using Betweenness and Information centrality. | 📝 Draft (F-011) |
| Q-004 | **VoI Prioritization** | Bayesian Value of Information for optimized question selection. | 📝 Draft (F-021) |
| Q-005 | **Planner-Executor-Critic** | Multi-agent autonomous loop with symbolic constraints. | 📝 Draft (F-040) |
| Q-006 | **Obsidian Integration** | Bi-directional sync with Obsidian PKM via REST API. | 📝 Draft (F-050) |

---

## 🤖 Jules Agent (Developer Automation)
*AI-driven delegation and environment management for developers.*

| Feature ID | Feature Name | Description | Status |
|:---|:---|:---|:---|
| J-001 | **Env Management (`jules env`)** | Declarative environment setup and configuration. | 💡 Submitted |
| J-002 | **jules delegate** | Automated session creation via Windmill for background tasks. | 💡 Submitted |
| J-003 | **jules diff** | Optimized session review flow via Windmill. | 💡 Submitted |
| J-004 | **YouTrack Auto-Close** | Automated issue resolution via GitHub/Windmill webhooks. | 💡 Submitted |

---

## 🔗 Yousidian & Integrations
*Connectivity between YouTrack, Obsidian, and external services.*

| Feature ID | Feature Name | Description | Status |
|:---|:---|:---|:---|
| I-001 | **YouTrack-Obsidian Sync** | Bi-directional task and document synchronization. | 🚧 In Progress |
| I-002 | **MapObsi Visualization** | Automated architecture diagrams (PlantUML/Mermaid) for codebases. | ✅ Implemented |
| I-003 | **Smart Downloader** | Intelligent URL routing (wget vs gallery-dl) with Rule34/TSM support. | ✅ Implemented |
| I-004 | **Windmill Status API** | Monitoring dashboard for running automation flows. | 💡 Submitted |

---

## 📊 Status Legend
- ✅ **Implemented**: Feature is fully functional and in use.
- 🚧 **In Progress**: Feature is currently under development.
- 📝 **Draft**: Detailed specification exists, but implementation has not started.
- 💡 **Submitted**: Vision or high-level task exists in YouTrack.

*Last Updated: 2026-03-22*
