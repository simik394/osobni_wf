# FalkorDB Automation Specification

Tento dokument definuje sadu funkcí a hooků, které je nutné implementovat, aby graf v FalkorDB odrážel realitu **automaticky** a bez manuálních zásahů.

## 1. Infrastruktura a Zdroje (Resource Allocation)
*Cíl: Využít existující Nomad/Consul stack a promítnout stav do grafu pro kontext.*

### A. Service Discovery (Consul Integration)
Místo vlastní implementace registry využijeme **Consul** jako Source of Truth.

*   **`syncServicesFromConsul()`**
    *   *Kde:* Samostatná služba nebo vlákno v `rsrch`.
    *   *Mechanism:* **Consul Blocking Queries** (Long Polling). Čeká na změnu v `X-Consul-Index`.
    *   *Logika:*
        1. `GET /catalog/services?wait=5m&index=...`
        2. IF Change Detected: Stáhne nový seznam.
        3. **Upsert Live**: `MERGE (:Service {id: consul_id}) SET .status = 'online', .ip = ...`
        4. **Soft Delete Dead**: Pokud služba zmizí z Consulu, v FalkorDB ji **nemažeme** (kvůli historii), jen `SET .status = 'offline'`.
    *   *Konzistence:* Zajišťuje, že graf vidí to samé co Consul, s max. zpožděním v řádu milisekund.
*   **`resolveService(serviceName: string)`**
    *   *Kde:* `FalkorClient`.
    *   *Akce:* Wrapper kolem Consul DNS/API pro nalezení endpointu (pokud není env var).

### B. Resource Locking (Browser Profiles)
Ačkoliv Consul K/V umí zámky, pro sémantickou vazbu na `(:Session)` je lepší držet stav v FalkorDB (nebo syncovat Consul Lock -> Graph).

*   **`acquireLock(resourcePath: string, sessionId: string)`**
    *   *Kde:* `FalkorClient` -> voláno před `puppeteer.launch`.
    *   *Logika:*
        1. CHECK: Je `(:Resource {path: $path})` volný (`in_use: false` nebo expirace)?
        2. IF free: `SET .in_use = true, .locked_by = $sessionId`.
        3. IF busy: Throw error / Wait.
*   **`releaseLock(resourcePath: string, sessionId: string)`**
    *   *Kde:* `finally` blok po ukončení práce nebo pádu agenta.

---

## 2. Projektový Kontext (MapObsi)
*Cíl: Automaticky propojovat `(:Session)` se soubory `(:File)`.*

### A. Tool Execution Hooks (Middleware)
Agenti (Angrav/Rsrch) nemají "vědomí", musí to dělat nástroje samotné. Je třeba obalit execution vrstvu.

*   **`instrumentFileSystemTools()`**
    *   *Kde:* V místě, kde agent registruje nástroje (`write_to_file`, `replace_file_content`).
    *   *Decorator Pattern:*
        ```typescript
        const originalWrite = tools.write_to_file;
        tools.write_to_file = async (args) => {
            await falkor.trackFileModification(currentSessionId, args.path); // <-- HOOK
            return originalWrite(args);
        }
        ```
*   **`trackFileModification(sessionId: string, filePath: string)`**
    *   *Akce:* `MATCH (s:Session), (f:File) MERGE (s)-[:MODIFIED]->(f)`.
    *   *Self-Healing:* Pokud `(:File)` neexistuje (nový soubor), vytvořit ho a označit jako `(:File {status: 'new'})`.

---

## 3. Pracovní Hierarchie (Goals & Tasks)
*Cíl: Udržovat kontext "Proč toto dělám?"*

### A. Context Injection
Při startu agenta (CLI nebo API) musíme předat ID rodičovského úkolu.

*   **`setSessionContext(sessionId: string, taskId: string)`**
    *   *Kde:* `POST /v1/chat/completions` (v těle requestu) nebo CLI argument `--task <id>`.
    *   *Akce:* `MATCH (s:Session), (t:Task) MERGE (t)-[:EXECUTED_IN]->(s)`.

### B. Progress Parsers
Agenti často reportují stav v přirozeném jazyce. Potřebujeme to strukturovat.

*   **`parseTaskUpdate(content: string)`**
    *   *Kde:* V `logInteraction` nebo jako LLM post-processing.
    *   *Trigger:* Pokud `content` obsahuje "[x]" nebo "Completed task...", aktualizuj status v DB.
    *   *Akce:* `MATCH (t:Task) SET .status = 'completed', .completedAt = timestamp()`.

---

## Shrnutí implementace (To-Do)

1.  **Shared Lib (`@agents/shared`)**:
    *   [ ] Implementovat `LockingManager` (Redis-based locks syncnuté do grafu).
    *   [ ] Pridat `ServiceRegistry` třídu.

2.  **Angrav / Rsrch Servers**:
    *   [ ] Přidat "Tool Wrappers" pro automatický tracking souborů.
    *   [ ] Implementovat Graceful Shutdown (pro uvolnění zámků).

3.  **Infrastructure**:
    *   [ ] Upravit Docker Entrypoints pro volání `registerService`.
