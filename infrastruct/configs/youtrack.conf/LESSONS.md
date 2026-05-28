# Lessons Learned: YouTrack configuration management (LDI)

## 1. Janus-SWI and Complex Terms
When bridging Python and Prolog using `janus-swi`, compound terms (like `action(create_field(Name, Type))`) can sometimes be tricky to serialize back to Python, especially if they are returned as opaque objects.
**Lesson**: Using `=..` (univ) in Prolog to convert terms to lists before returning them to Python is a robust strategy.
```prolog
% Convert actions to list of lists for easy Python consumption
plan(_Actions), maplist(=.., _Actions, ActionLists)
```

## 2. Dependency-Aware Configuration
Fields in YouTrack often rely on "Bundles" (sets of values). Attempting to create a field before its bundle exists results in API errors.
**Lesson**: Use a logic engine to compute dependencies. In Prolog, we can express this naturally:
```prolog
depends_on(create_field(F, _), ensure_bundle(B, _)) :- field_uses_bundle(F, B).
```
And then use `topological_sort` to ensure the `Actuator` receives commands in the correct order.

## 3. Idempotency vs. State Drift
An actuator must be able to run repeatedly without side effects if the state matches.
**Lesson**: Every action should check both the *target state* (what we want) and the *current state* (what we have) before deciding to act. This prevents "action loops" where the engine keeps trying to create a field that already exists but wasn't correctly detected.

## 4. SWI-Prolog and Pip (Ansible)
Installing `janus-swi` via Ansible `pip` module can be brittle if it tries to install into a user directory that doesn't exist or isn't in Python's path.
**Lesson**: For infrastructure roles, prefer system-wide installation (`become: true` and no `--user` flag) to ensure all services (like Windmill or background workers) can access the library.

## 5. Prolog plunit Module Context
When using `plunit` test framework, tests run inside a generated module (e.g., `plunit_diff_logic`). If you `assertz` facts without module qualification, they go into the test module's namespace—not the `user` module where your production rules look for them.
**Lesson**: Always use `assertz(user:fact(...))` and `retractall(user:fact(...))` in plunit setup/cleanup to ensure facts are visible to rules defined in `core.pl`.

## 6. Actuator-Level Idempotency Guards
When the inference engine (Prolog) generates `create_field` actions, there's always a risk that sensing missed an existing field (API pagination, name/type mismatch). The original "fix" was a blanket controller-side filter that skipped ALL `create_field` actions — a "NUCLEAR OPTION" that prevented any new fields from ever being created.
**Lesson**: Idempotency must be implemented at the **lowest possible level** (actuator, not controller). The actuator should: (1) pre-check existence before calling POST, and (2) handle 409 Conflict gracefully. The controller filter should only act as "defense-in-depth" for confirmed-existing fields, never as a blanket skip.

## 7. Janus Dynamic Fact Clearing in Polymorphic Models
When introducing new dynamic and polymorphic Prolog predicates (such as reports or issue link types) into a system bridged with Janus, it is essential to list all of them explicitly within python's `clear_facts` method. Missing dynamic facts will survive across test cases, bleeding state and causing non-deterministic unit/integration test failures.

## 8. Pydantic 2 Alias & Field Name Mapping
When adding new configuration blocks to root Pydantic models containing field aliases (e.g. `issueLinkTypes` for `issue_link_types`), we must explicitly set `model_config = {"populate_by_name": True}` in the configuration model (e.g. `YouTrackConfig`). Without this configuration, instantiating the model using snake_case field names directly (which is standard in tests or manual objects creation) will silently ignore the passed parameters, resulting in empty models.

## 9. Typová a arity konzistence u Prolog dynamic predikátů a Janus převodů
Při přechodu mezi Pythonem a Prologem přes Janus je nezbytné striktně dodržovat aritu dynamic predikátů napříč všemi vrstvami (sensing, retracting, diff logic pravidla). Nesoulad (např. asertování arity 7, ale mazání s arity 8) vede k tomu, že Prolog pravidla tichým způsobem selžou. Dále je nutné pamatovat, že booleovské atomy (`true`/`false`) asertované v Prologu se přes Janus-SWI do Pythonu vrací jako řetězce (`"true"`/`"false"`), nikoliv jako nativní Python `True`/`False`. Aserce v integračních testech musí s tímto chováním počítat.

## 10. Asynchronní přepočty YouTrack Reportů
YouTrack REST API zpracovává výpočet nově vytvořených nebo aktualizovaných reportů asynchronně na pozadí. Pokud chce uživatel ihned vidět aktuální data na dashboardu, actuator musí po vytvoření/úpravě reportu odeslat explicitní POST požadavek na `/api/reports/{id}/status` s prázdným tělem, což YouTrack donutí okamžitě spustit přepočet a minimalizuje to dobu, po kterou report zobrazuje prázdná data.

## 11. In-memory Lua integrace pomocí Lupa
Integrace programovatelných konfigurací v Lua přes knihovnu `lupa` je extrémně rychlá a čistá, protože běží in-memory přímo v Python procesu a nevyžaduje externí subprocesy s `lua` CLI. Při rekurzivním převodu Lua tabulek na Python datové typy je nutné zohlednit, že Lupa neexportuje interní typy jako `LuaTable` přímo v `__init__.py` a jejich název se liší podle zkompilované verze Lua (např. `_LuaTable`). Jako 100% univerzální a přenositelný způsob se osvědčilo typ zjišťovat pomocí řetězcové komparace `type(obj).__name__ == '_LuaTable'`.

## 12. Idempotentní a bezpečné seedování úkolů
Při zavedení vzorových dat do nově vytvořených projektů (Project Seeding) se osvědčilo popsat startovací úkoly v konfiguraci a v sensing fázi zjišťovat prázdnost projektu (`curr_project_empty/1`). Samotné vytváření úkolu v aktuátoru je bezpečné rozdělit na dva kroky: nejprve odeslat POST pro vytvoření úkolu s titulkem a popisem (který projde vždy) a v druhém kroku se pokusit bezpečně aktualizovat vlastní pole (jako Type a Priority). Pokud tato pole v projektu chybí, zaloguje se pouze varování, ale úkol zůstane úspěšně vytvořen, což zajišťuje safe-default chování.

## 13. Visual IaC s Draw.io diagramy, Nim a Prologem
Při vizuálním definování infrastruktury (Visual IaC) je nejlepším přístupem oddělení syntaktického a sémantického zpracování. Rychlý zkompilovaný parser v jazyce Nim (`drawio2prolog`) má na starosti pouze XML dekódování prvků Draw.io (`mxCell` a `<object>` s metadaty) a jejich převedení na čistá Prolog fakta (`diagram_node/4`, `diagram_edge/5`). Kompletní sémantická interpretace diagramu (jak spolu uzly souvisí, co reprezentují) je napsána v Prologu jako čistě deklarativní pravidla. Aby se zabránilo kolizím s dynamic/static predikáty a zjednodušil se životní cyklus fact-clearingu, je optimální materiálovat fakta z diagramu (`materialize_diagram_facts`) dynamically na začátku generování plánu (`plan/1`). Tím zůstane celá integrace transparentní a naprosto bezchybně spolupracuje s existujícím YAML/Lua config parserem.

## 14. Formální matematická verifikace a verified topological sort v OCaml
Zavedení matematické rigoróznosti do LCA IaC cyklu pomocí OCaml kombinuje výhody silného typového systému ("correct by construction") s ex-post result checkerem (Translation/Result Validation).
- **Correct by construction**: Reprezentace konfigurace přes rigidní OCaml datové typy (např. varianty pro typy polí) eliminuje neplatné konfigurace v samotném zárodku.
- **Dopředná verifikace výsledku (Result Checker)**: Namísto složitého dokazování komplexního topologického algoritmu v dokazovači vět, implementujeme jednoduchý a matematicky sound result checker. Ten u hotového seřazeného plánu ověří dvě základní matematické vlastnosti:
  1. *Completeness* (sorted list je permutací vstupu - žádný prvek se neztratil ani nepřebývá).
  2. *Order preservation* (pro každou hranu $A \to B$ platí, že index $B$ je menší než index $A$).
  Tento přístup je extrémně robustní a 100% zaručuje matematickou korektnost.
- **Komunikační kanál (pipe a oddělení závislostí)**: Při přenosu složitých termů z Prolog/Pythonu do OCaml se jako nejstabilnější přístup osvědčilo nepoužívat vnořené Prolog struktury se složitým escapováním uvozovek. Namísto toho se zprávy serializují do jednoduchých řádkových prefix-formátů (`action:...`, `edge:...`) s jasnými delimitery (jako pipe `|` nebo středník `;`). OCaml je pak bleskově zpracuje a vrátí Pythonu zpět čistý seřazený seznam, který Python snadno rekonstruuje pomocí `ast.literal_eval`.
- **Janus a dynamic diagram materializace**: Při spouštění verifikátoru na čistém prostředí (např. po `clear_facts()`) musíme v Pythonu nejprve explicitně zavolat `materialize_diagram_facts`, aby se diagram zkompilovaný Nimem přeložil na sémantická fakta *předtím*, než se pokusíme fakta exportovat do OCamlu. Bez tohoto kroku by verifikátor pracoval s prázdnou konfigurací.

## 15. Formální analýza dosažitelnosti stavů (Workflow Reachability) a record field shadowing v OCaml
Při implementaci formální verifikace stavových automatů (reachability a stuck-state analýzy) v OCaml 5 se ukázalo několik klíčových poznatků:
- **Record Field Shadowing (Zastínění polí záznamu)**: V OCamlu platí, že pokud více typů záznamů (records) definuje pole se stejným názvem (např. `value` v `state_value`, `bundle_value` i `default_value`), naposledy definovaný typ toto pole zastíní. To vede k neočekávaným chybám při typové inferenci u anonymních funkcí a mapování (např. `List.map (fun sv -> sv.value) list_of_state_values` se pokusí typovat `sv` jako `default_value`). Řešením je explicitní anotace typu argumentu anonymní funkce `(sv : state_value) -> sv.value` nebo přímá anotace proměnné `(sv : state_value).value`.
- **Rigidní DFS grafové procházení**: Verifikace korektnosti workflow stavových automatů vyžaduje striktní DFS (Depth-First Search) s detekcí cyklů. Stuck-state (deadlock) verifikace spolehlivě odhalí uzly (nevyřešené stavy), z nichž neexistuje žádná orientovaná cesta do alespoň jednoho vyřešeného stavu (`is_resolved = true`). Unreachable-state verifikace zase zaručuje, že každý definovaný stav v bundle je dosažitelný z výchozího/defaultního stavu.
