# Lessons Learned - Nomad Stack Infrastructure

## Feature: Consul DNS & Traefik Integration
**Date:** 2025-12-19

### 1. Dual-Access Documentation Strategy
- **Issue:** Moving from IP-based access (`nip.io`) to DNS-based access (`.consul`) can break user muscle memory or scripts if the documentation only shows the new method.
- **Solution:** Maintain a "Dual-Access" table in the README that shows both the IP-based URL (for quick/legacy access) and the Consul DNS URL (for the permanent setup). This eases the transition and provides fallback options.

### 2. Exhaustive Service Mapping
- **Issue:** When updating service tables, it's tempting to only show "major" services (Windmill), but this leads to confusion about the status of management UIs (Consul, Nomad, Vault).
- **Solution:** Always include core infrastructure UIs in the primary "Services & Access" table. Truncating these in documentation often leads to the user thinking they are missing or misconfigured.

### 3. Progressive DNS Disclosure
- **Issue:** Telling a user they can use "server names" is only half the battle; the configuration for system-wide resolution is complex.
- **Solution:** Provide explicit, copy-pasteable configuration for `systemd-resolved` (common in Ubuntu/Pop!_OS) to forward `.consul` queries. Documentation should include both the *result* (how to use the names) and the *enabler* (how to configure the resolver).

### 4. Placeholder Consistency
- **Issue:** Swapping between generic placeholders like `<IP>` and specific ones like `<SERVER_IP>` can make documentation feel inconsistent with previous versions.
- **Solution:** Stick to existing placeholder conventions (e.g., `<SERVER_IP>`) to ensure the user's existing mental model of the setup remains intact.
