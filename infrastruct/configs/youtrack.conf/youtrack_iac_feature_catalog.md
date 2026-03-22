# Feature Catalog: YouTrack IaC (Infrastructure as Code)

**Project Location**: `infrastruct/configs/youtrack.conf`  
**Purpose**: Declarative configuration management for YouTrack using YAML and Prolog-based logic.

## 🛠️ Core Engine (Inference & Application)
| Feature | Description | Status |
|:---|:---|:---|
| **YAML State Parser** | Reads desired state from YAML files in the `projects/` directory. | ✅ Implemented |
| **Prolog Logic Engine** | Computes the minimal diff between current and desired YouTrack state. | ✅ Implemented |
| **REST API Actuator** | Applies changes to YouTrack using the REST API with idempotency. | ✅ Implemented |
| **Dry Run Mode** | Previews all API calls and logic decisions without making changes. | ✅ Implemented |
| **Non-Destructive Ops** | Resources are only deleted if explicitly set to `state: absent`. | ✅ Implemented |
| **Vault Integration** | Securely fetches YouTrack tokens from HashiCorp Vault. | ✅ Implemented |

## 📋 Resource Management
| Feature | Description | Status |
|:---|:---|:---|
| **Project Management** | Create and update projects (name, shortName, leader). | ✅ Implemented |
| **Custom Fields** | Manage all field types (enum, state, string, etc.) and bundles. | ✅ Implemented |
| **Agile Boards** | Full config for columns, WIP limits, swimlanes, and backlog queries. | ✅ Implemented |
| **Workflow Management** | Attach/detach JS workflows; support for inline or file-based rules. | ✅ Implemented |
| **Global Tags** | Management of tags with `untag_on_resolve` support. | ✅ Implemented |
| **Saved Queries** | Creation and management of global or shared saved searches. | ✅ Implemented |
| **Card Visibility** | Configuration of which fields appear on board cards. | ❌ API Limited |
| **Reporting (IaC)** | Declarative setup for YouTrack reports. | 📋 Proposed |

## 🚀 Operations & DevOps
| Feature | Description | Status |
|:---|:---|:---|
| **Windmill Flows** | Pre-built Windmill scripts and flows for automated sync. | ✅ Implemented |
| **Nomad Jobs** | Job definitions for running the sync as a background worker. | ✅ Implemented |
| **Dev Container** | VS Code Dev Container with SWI-Prolog and Janus bridge. | ✅ Implemented |
| **Export Tool** | CLI tool to export current YouTrack state to YAML configuration. | ✅ Implemented |

## 🧪 Implementation Verification
- **Unit Tests**: Full coverage for config parsing, logic inference, and controller flow.
- **Actuator Tests**: Mocked API tests for all resource types.
- **Workflow Tests**: Verification of JS rule attachments.

*Last Updated: 2026-03-22*
