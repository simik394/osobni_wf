# Lessons Learned: Pipeline Stabilization & Stateless CLI Migration

## 1. Architectural Parity is Mandatory
In a distributed sidecar architecture (Nomad/SSH), the CLI MUST NOT have local dependencies that require direct access to backend databases or specialized drivers (like FalkorDB). Every stateful operation must be proxied through the API server to ensure the CLI remains a lightweight, portable binary.

## 2. Centralized Authentication Hardening
Google login flows are fragile and subject to frequent anti-botting updates. Centralizing this logic in a single `ensureGoogleAuthAction` utility allowed us to fix auth bugs for both Gemini and NotebookLM simultaneously, significantly reducing technical debt and maintenance overhead.

## 3. Server Startup Lifecycle
Backend stores (Graph Store, Artifact Registry) should be initialized eagerly during server startup. Relying on "lazy connection" within route handlers introduces race conditions and complex error handling logic in the API bridge.

## 4. Resource Cleanup in Headless Environments
Temporary files (cloned repos, converted audio, registry exports) must be aggressively cleaned up by the server. Since the CLI is stateless, it cannot be responsible for cleaning up artifacts created during a request.

## 5. Avoiding "Hallucinated" Registry IDs
When the CLI asks for archived artifacts, the server should return the actual registry state. The CLI must never assume the existence of local files or "placeholder" IDs like `other_artifact_x`, as this leads to broken state synchronization.
