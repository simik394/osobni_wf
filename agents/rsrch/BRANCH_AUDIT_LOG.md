# PWF Git Branch Audit & Consolidation Log

Tento log slouží jako **trvalý a perzistentní záznam** o auditu, asimilaci a čištění všech zapomenutých git větví v repozitáři PWF.

---

## 📋 Přehled provedených auditů a rozhodnutí

| Větev | Typ | Unikátní commity | Zjištění a analýza obsahu | Rozhodnutí | Odůvodnění |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **`halvarm/consolidation-v1`** | Vzdálená (halvarm) | 0 | Žádné rozdíly ani nové commity oproti naší aktivní větvi. | **Smazat** (Delete) | Větev je plně sloučená a identická s aktivním kódem. |
| **`archive/jules-history-2026-04`** | Lokální / Vzdálená | 16 | Starý historický snapshot z dubna 2026. Obsahuje pouze zastaralé verze skriptů (které máme novější) a stažené slides/materiály v PDF z LMS Moodle. Žádný živý kód nechybí. | **Smazat** (Delete) | Kód asimilován, těžké PDF soubory jsou bezpečně uchovány v originálním gitu/LMS. |
| **`archive/jules-consolidation-v1-massive`** | Vzdálená | 1 | Dummy commit („Cancel session due to branch deletion“) vytvořený při rušení starého sezení. Neobsahuje žádný užitečný kód. | **Smazat** (Delete) | Neobsahuje žádné funkční změny ani kód. |
| **`archive/jules-notebooklm-extensions-massive`** | Vzdálená | 0 | Žádné unikátní rozdíly. Všechny NotebookLM extenze byly v průběhu vývoje asimilovány. | **Smazat** (Delete) | Větev je plně sloučená. |
| **`archive/jules-sandbox-probe-results`** | Vzdálená | 1 | Obsahuje pouze staré výsledky testování sandboxu z dřívějších pokusů. Naše nová verifikace (`verify`) je mnohem dokonalejší. | **Smazat** (Delete) | Testovací data jsou zastaralá, verifikační engine je plně asimilován. |
| **`archive/jules-youtrack-iac-uam-massive`** | Vzdálená | 2 | Obsahuje implementaci User Access Management (UAM) pro YouTrack IaC. Důkladný grep potvrdil, že tyto UAM změny (např. `# UAM facts` v `inference.py`) jsou již plně sloučeny a aktivní v naší větvi. | **Smazat** (Delete) | Změny jsou již plně integrovány v hlavním kódu. |
| **`experiment/jules-git-nesting`** | Vzdálená | 1 | Identická s `main` větví. Obsahuje pouze opravu TS typů. | **Smazat** (Delete) | Větev je již plně sloučená do `main`. |
| **`experiment/jules-sandbox-probe-v2`** | Lokální / Vzdálená | ~50+ | Hlavní vývojová větev obsahující veškeré nové featury (Lua config, verify CLI, falkordb, nomad atd.). | **Sloučit** (Merge) | Kompletně a bezpečně sloučena do `main` (fast-forward) a následně odstraněna. |


---

## 🛠️ Detaily auditu jednotlivých větví

### 1. `remotes/halvarm/consolidation-v1`
*   **Commity navíc**: 0
*   **Analýza**: Větev je přímým předkem nebo je totožná s naší aktivní větví. `git diff` nevykazuje žádné rozdíly.
*   **Rozhodnutí**: Smazat referenci na halvarm větev.

### 2. `archive/jules-history-2026-04`
*   **Commity navíc**: 16 (starší CI patche, experimenty s SDK a crawlingem)
*   **Analýza**: Větev obsahuje historické PDF prezentace z VŠE Moodle kurzu `4IT415` a starší verze crawlerů. Všechny funkční crawlery (`moodle_crawler.js`, `insis_crawler.js`) byly mezitím přepsány do čistší a robustnější podoby v naší větvi. Staré PDF soubory není nutné držet v aktivním repozitáři.
*   **Rozhodnutí**: Smazat lokální i vzdálenou větev.

### 3. `archive/jules-consolidation-v1-massive`
*   **Commity navíc**: 1 (zástupný commit pro zrušení sezení botem)
*   **Analýza**: Žádné reálné změny kódu.
*   **Rozhodnutí**: Smazat vzdálenou větev.

### 4. `archive/jules-notebooklm-extensions-massive`
*   **Commity navíc**: 0
*   **Analýza**: Plně sloučeno.
*   **Rozhodnutí**: Smazat vzdálenou větev.

### 5. `archive/jules-sandbox-probe-results`
*   **Commity navíc**: 1 (zápis testovacích výsledků)
*   **Analýza**: Stará data, která nemají vliv na funkčnost CLI.
*   **Rozhodnutí**: Smazat vzdálenou větev.

### 6. `archive/jules-youtrack-iac-uam-massive`
*   **Commity navíc**: 2 (User Access Management featura)
*   **Analýza**: Ověřil jsem existenci UAM logiky přímo v `infrastruct/configs/youtrack.conf/src/logic/inference.py` (řádek 92, `# UAM facts`). Kód je již stoprocentně asimilován a vyvíjen na naší hlavní větvi.
*   **Rozhodnutí**: Smazat vzdálenou větev.

### 7. `experiment/jules-git-nesting`
*   **Commity navíc**: 1 (identická s main)
*   **Analýza**: Žádné rozdíly oproti `main`.
*   **Rozhodnutí**: Smazat vzdálenou větev.

### 8. `experiment/jules-sandbox-probe-v2`
*   **Commity navíc**: ~50+
*   **Analýza**: Hlavní pracovní a experimentální větev, kde probíhal veškerý vývoj (verifikační engine, integrace falkordb, nomad, lua skripty).
*   **Rozhodnutí**: Sloučit do `main` (Merge) a následně bezpečně smazat z lokálu i origin.

