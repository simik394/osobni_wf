Architektonický plán pro Logic-Driven Infrastructure: Implementace modelově řízené správy konfigurací pro JetBrains YouTrack
1. Exekutivní shrnutí a strategický kontext
Tento report představuje vyčerpávající architektonickou analýzu a implementační plán pro přechod správy konfigurací platformy JetBrains YouTrack na modelově řízený přístup (Model-Based Configuration Management). V současné době se oblast Infrastructure as Code (IaC) nachází v bodě zvratu. Zatímco nástroje založené na orientovaných acyklických grafech (DAG), jako jsou Terraform či Ansible, úspěšně standardizovaly provisioning výpočetních zdrojů, narážejí na své limity v oblasti správy aplikačních konfigurací (Application Configuration Management - ACM).
Cílem je navrhnout robustní systém založený na logickém programování (Logic Programming - LP), který posune paradigma od imperativního skriptování ("pokud neexistuje X, vytvoř X") k deklarativnímu vyvozování ("systém musí splňovat axiomy Y"). Report analyzuje dvě hlavní varianty řešení:
1. Varianta A (Rekurzivní inferenční engine): Využití SWI-Prolog ve spojení s knihovnou Janus pro obousměrnou integraci s Pythonem. Tato varianta sází na flexibilitu unifikace a schopnost introspekce.
2. Varianta B (Optimalizační engine omezení): Využití Answer Set Programming (ASP) a řešiče Clingo s Python ORM knihovnou Clorm. Tato varianta, inspirovaná balíčkovacím manažerem Spack, rámuje konfiguraci jako NP-těžký problém splnitelnosti podmínek (SAT) s globální optimalizací.
Analýza je zasazena do kontextu moderního technologického stacku zahrnujícího Obsidian jako znalostní bázi a UI pro definici pravidel, n8n pro orchestraci workflow a HashiCorp Nomad pro efektivní a flexibilní exekuci logických jader.
________________
2. Anatomie problému: Krize komplexity v konfiguraci YouTrack
Pro pochopení nutnosti radikální změny paradigmatu je nezbytné detailně analyzovat specifika konfiguračního prostoru JetBrains YouTrack. Na rozdíl od "plochých" API pro správu cloudových instancí, YouTrack představuje systém s "hlubokým schématem" (Deep Schema), kde entity nejsou izolované, ale tvoří hustou síť sémantických závislostí.
2.1 Cyklické závislosti a problém "Slepice a vejce"
Standardní IaC nástroje selhávají při řešení cyklických závislostí, které jsou v YouTracku běžné. Typický scénář zahrnuje:
* Projekt vyžaduje přiřazení Workflow.
* Workflow je skript (JavaScript), který odkazuje na konkrétní Custom Fields (např. "Priority") a jejich hodnoty (např. "Critical").
* Custom Field "Priority" závisí na existenci Bundle (sady hodnot).
* Bundle může být sdílený mezi projekty nebo nezávislý, a jeho obsah může být dynamicky ovlivňován jinými workflow.
Pokud se pokusíme nasadit novou verzi Workflow, která referuje na novou hodnotu v Bundle, imperativní skript musí nejprve detekovat tuto sémantickou závislost uvnitř kódu workflow (což je pro Terraform "opaque blob"), aktualizovat Bundle a teprve poté nasadit Workflow. Pokud se toto pořadí nedodrží, nasazení selže nebo, hůře, workflow bude nasazeno v rozbitém stavu, což se projeví až při běhu (Runtime Failure).
2.2 Taxonomie defektů při rekonciliaci stavu
Výzkum identifikuje čtyři hlavní kategorie defektů, které trápí současné imperativní přístupy a které má navrhované řešení eliminovat:
1. Inventory Defects (Defekty inventáře): Rozpor mezi tím, co si myslíme, že v systému je (v kódu), a tím, co tam skutečně je (v API). Imperativní skripty často postrádají robustní mechanismus pro detekci "duchů" (ghost resources) – entit, které byly vytvořeny manuálně nebo jiným procesem a měly by být smazány. Logické programování toto řeší explicitním "Closed World Assumption" (předpoklad uzavřeného světa) nebo pravidly pro garbage collection: delete(X) :- curr_resource(X), \+ target_resource(X).
2. Property Defects (Defekty vlastností): Prostředek existuje, ale má nesprávné atributy (např. pole je typu string místo text). Prolog řeší toto přirozeně pomocí unifikace: Target = Current selže, pokud se vlastnosti neshodují, což automaticky triggeruje opravnou akci.
3. Relation Defects (Defekty vztahů): Nejtragičtější kategorie pro YouTrack. Například Projekt existuje, Workflow existuje, ale vazba mezi nimi chybí. V grafových databázích (a Prologu) jsou vztahy "first-class citizens" (attached(project, workflow)), což činí detekci chybějících vazeb triviální.
4. Group Defects (Skupinové defekty): Problémy vznikající při hromadných operacích nad sadami entit.
2.3 Specifická rizika API YouTrack
Práce s YouTrack REST API přináší specifická technická rizika, která musí architektura zohlednit:
* Rate Limiting (429 Too Many Requests): Agresivní dotazování nebo paralelní vytváření polí může rychle vyčerpat kvóty. Navrhovaný systém musí implementovat inteligentní dávkování (batching) a exponenciální backoff.
* Destruktivní změny typů: Změna typu Custom Field (např. z string na enum) je nevratná operace, která může vést ke ztrátě dat v tisících Issues. Logický model musí obsahovat "Safety Gates" – pravidla, která zakazují generování plánu obsahujícího nebezpečné tranzice bez explicitního schválení.
* Rozlišení Bundle typů: API rozlišuje mezi EnumBundle, StateBundle, UserBundle atd. Záměna ID nebo typu vede k chybám, které jsou v JSONu těžko čitelné, ale v silně typovaném logickém modelu (Clorm/Prolog) jsou odhalitelné při kompilaci.
________________
3. Metodologie a Nástrojový Ekosystém
Pro úspěšnou implementaci "Logic-Driven Infrastructure" nestačí pouze vybrat logický jazyk. Je nutné integrovat celý ekosystém nástrojů, které uživatel již ovládá (Obsidian, n8n, Nomad), do soudržného celku.
3.1 Znalostní báze: Obsidian jako IDE pro logiku
Obsidian nebude sloužit pouze pro psaní poznámek, ale stane se primárním rozhraním pro definici konfiguračních pravidel (Input Interface).
* Mechanismus: Uživatel definuje pravidla v Markdown souborech s využitím YAML frontmatter pro statická fakta a code blocků pro dynamická pravidla.
* Integrace: Pomocí Python skriptů (využívajících knihovnu python-frontmatter) a regulárních výrazů bude obsah vaultu parsován a transformován do vstupních souborů pro logický solver (.pl nebo .lp).
* Vizualizace: Grafové zobrazení v Obsidianu bude využito pro vizualizaci závislostí mezi entitami (projekt -> pole -> bundle) ještě před nasazením, což umožní vizuální kontrolu komplexity.
3.2 Orchestrace: n8n jako nervové centrum
n8n převezme roli orchestrátora, který řídí tok dat mezi Gitem (kde jsou uložena pravidla), YouTrack API a Nomad joby.
* Workflow Design:
   1. Trigger: Webhook z Git repozitáře (při pushi do main) nebo plánovač (Schedule) pro detekci driftu.
   2. Submission: n8n sestaví Nomad job specifikaci (HCL/JSON) a odešle ji do Nomad API.
   3. Wait & Poll: n8n využije "Wait" node nebo polling loop k dotazování Nomad API na stav jobu (Allocation Status). Nomad je pro batch joby ideální, protože po dokončení kontejneru automaticky reportuje exit code.
   4. Result Retrieval: Po úspěšném doběhnutí jobu n8n stáhne vygenerovaný plán (např. z artefaktů nebo logů, pokud jsou malé).
3.3 Exekuce: HashiCorp Nomad
Místo těžkotonážního Kubernetes využijeme Nomad, který je pro tento typ zátěže (krátkodobé, intenzivní výpočetní batch joby) výrazně vhodnější.
* Batch Jobs: Využijeme typ jobu batch (nikoliv service). To zajistí, že Nomad kontejner spustí, počká na dokončení logického výpočtu a poté uvolní zdroje. Kubernetes by se snažil pod neustále restartovat, pokud bychom správně nenastavili RestartPolicy: OnFailure.
* Task Drivers: Primárně využijeme docker driver pro izolaci prostředí (SWI-Prolog/Clingo + Python dependencies).
* Secrets & Config: Pro předávání API klíčů (YouTrack Token) využijeme nativní integraci Nomadu s HashiCorp Vault (pokud je dostupný) nebo Nomad Variables/Encrypted Environment Variables.
* Artifacts: Vstupní data (logická pravidla z Obsidianu) mohou být do jobu doručena pomocí artifact stanza (stažení z Gitu/S3) přímo Nomadem, což zjednodušuje logiku v kontejneru.
________________
4. Architektura Logic-Controller-Actuator (LCA)
Jádrem návrhu je vzor Logic-Controller-Actuator (LCA), který striktně odděluje vedlejší efekty (I/O) od čisté logiky.
4.1 Controller (Imperativní skořápka - Python)
Controller je zodpovědný za vytvoření "Digitálního dvojčete" infrastruktury.
* Role: Dotazuje se YouTrack REST API, řeší paginaci, autentizaci a chybové stavy.
* Transformace: Převádí hluboké JSON objekty na atomická fakta. Například zanořený objekt project.fields.bundle.values rozpadne na sérii faktů: has_field(P, F), field_uses_bundle(F, B), bundle_has_value(B, V).
* Technologie: Python 3.11+, Pydantic pro validaci dat, requests pro API volání.
4.2 Logic Core (Funkcionální jádro - Prolog/ASP)
Zde probíhá veškeré rozhodování. Engine nemá přístup k síti ani disku (s výjimkou načtení faktů).
* Vstup: Extensional Database (EDB - fakta z Controlleru) + Intensional Database (IDB - pravidla z Obsidianu).
* Proces: Výpočet $\Delta = IDB \setminus EDB$.
* Výstup: Seznam akcí (Action Plan), topologicky seřazený (v případě Prologu) nebo sada akcí k provedení (v případě ASP).
4.3 Actuator (Handler vedlejších efektů - Python)
Provádí změny v reálném světě.
* Role: Přebírá plán z Logic Core a volá API endpointy (PUT, POST, DELETE).
* Idempotence: Klíčový požadavek. I když Logic Core spočítá, že je třeba vytvořit pole, Actuator musí těsně před voláním ověřit, zda pole mezitím nevzniklo (prevence race conditions).
* Safety: Implementuje "Dry Run" mód, kdy pouze vypíše plánované změny bez jejich provedení.
________________
5. Detailní analýza Varianty A: Rekurzivní inferenční engine (SWI-Prolog + Janus)
Tato varianta využívá sílu unifikace Prologu a těsného propojení s Pythonem skrze knihovnu Janus. Je ideální pro scénáře, kde je kladen důraz na flexibilitu pravidel a introspekci procesu rozhodování.
5.1 Technický design
* Integrace Janus: Knihovna Janus umožňuje volat Prolog z Pythonu (janus.query()) a Python z Prologu (py_call()). To umožňuje "líné vyhodnocování" – Prolog může v případě potřeby požádat Python o dotažení dodatečných dat z API uprostřed inference.
* Topologické třídění: Prolog je přirozeně vybaven pro rekurzivní procházení grafů. Pravidlo pro vytvoření plánu může přímo obsahovat logiku topologického třídění:
Prolog
plan(OrderedActions) :-
   findall(A, action(A), Unsorted),
   topological_sort(Unsorted, OrderedActions).

Tím je zaručeno, že akce budou vykonány ve správném pořadí (Bundle -> Field -> Workflow).
5.2 Work Breakdown Structure (WBS) - Varianta A (Nomad)
ID
	Úkol (Task Name)
	Detailní popis a technické poznámky
	Závislosti
	Odhad (Opt/Pes)
	Komplexita
	A.1
	Příprava Infrastruktury
	Setup Nomad, Docker a CI/CD
	

	3 / 7 MD
	Medium
	A.1.1
	Docker Image Build
	Vytvoření Dockerfile (multi-stage) s swipl:stable. Kompilace janus_swi s Python 3.11 headers. Optimalizace velikosti pro rychlé stahování na Nomad klienty.
	-
	0.5 / 1.5 MD
	Low
	A.1.2
	Nomad Job Spec
	Vytvoření logic-core.nomad.hcl. Definice typu batch, konfigurace resources (CPU/RAM) a artifact pro stažení pravidel. Nastavení restart { attempts = 0 }.
	A.1.1
	0.5 / 1 MD
	Medium
	A.1.3
	Obsidian Parser
	Vývoj Python skriptu (frontmatter lib + regex) pro extrakci Prolog pravidel z .md souborů v Obsidian vaultu a jejich konkatenaci do kb.pl.
	-
	1 / 2 MD
	Medium
	A.1.4
	Auth Management
	Integrace s Nomad Variables nebo HashiCorp Vault pro bezpečné předání YouTrack tokenu do proměnné prostředí kontejneru (env { YOUTRACK_TOKEN =...}).
	-
	0.5 / 1 MD
	Low
	A.2
	Controller (Sensing)
	Implementace discovery logiky
	A.1
	5 / 10 MD
	High
	A.2.1
	Ontologie Prologu
	Návrh predikátů: curr_field/3, bundle_value/3, workflow_active/2. Definice mapování JSON $\leftrightarrow$ Prolog Terms.
	-
	1 / 2 MD
	High
	A.2.2
	API Client (Fields)
	Implementace GET /api/admin/customFieldSettings/customFields s parametry ?fields=... pro optimalizaci payloadu. Paginace.
	A.1.4
	1 / 2 MD
	Medium
	A.2.3
	API Client (Bundles)
	Implementace logiky pro EnumBundles a StateBundles. Rozlišení independent vs shared sad hodnot.
	A.1.4
	1.5 / 3 MD
	High
	A.2.4
	Janus Injection
	Implementace Python smyčky, která iteruje přes JSON data a volá janus.query("assertz(...)") pro naplnění paměti Prologu fakty.
	A.2.1
	0.5 / 1 MD
	Medium
	A.3
	Logic Core (Reasoning)
	Vývoj Prolog inferenčního enginu
	A.2
	8 / 15 MD
	Very High
	A.3.1
	Target DSL
	Návrh doménově specifického jazyka v Prologu pro definici cílového stavu (např. require_field(Project, FieldName, Type)).
	A.2.1
	2 / 4 MD
	High
	A.3.2
	Diff Logic
	Implementace pravidel pro detekci rozdílů: missing_resource/1, drifted_property/2. Využití unifikace pro porovnání JSON struktur.
	A.3.1
	2 / 4 MD
	High
	A.3.3
	Dependency Graph
	Implementace pravidel depends_on(ActionA, ActionB). Např. vytvoření pole závisí na vytvoření bundlu.
	A.3.2
	2 / 4 MD
	Very High
	A.3.4
	Topological Sort
	Implementace algoritmu pro seřazení akcí na základě depends_on/2. Detekce cyklů a vyhození výjimky v případě nekonzistence.
	A.3.3
	1 / 2 MD
	Medium
	A.4
	Actuator (Execution)
	Vývoj exekučního modulu
	A.3
	5 / 10 MD
	High
	A.4.1
	Action Dispatcher
	Python funkce přijímající seznam termů `` z Janusu a volající příslušné API metody.
	A.3.4
	1 / 2 MD
	Medium
	A.4.2
	Bundle Updates
	Implementace logiky pro přidávání hodnot do Bundlů. Pozor na Archive status hodnot a merge konfliktů.
	A.4.1
	1.5 / 3 MD
	High
	A.4.3
	Workflow Upload
	Implementace multipart uploadu pro workflow ZIP soubory. Generování ZIPu z JS kódu on-the-fly.
	A.4.1
	1.5 / 3 MD
	High
	A.4.4
	Rate Limiting
	Implementace dekorátoru pro 429 handling s využitím Retry-After hlavičky a exponenciálního čekání.
	-
	0.5 / 1 MD
	Medium
	5.3 Hodnocení Varianty A
   * Výhody:
   * Nomad Synergy: Prolog proces je lehký a rychle startuje, což perfektně sedí do Nomad batch jobu.
   * Introspekce: Možnost "zeptat se" systému, proč učinil určité rozhodnutí (?- why(action(create_field(X))).).
   * Výkon: Rychlé pro menší až střední grafy závislostí. Janus eliminuje overhead serializace dat.
   * Nevýhody & Rizika:
   * Složitost Janusu: Debuggování chyb na rozhraní C-API mezi Pythonem a Prologem může být náročné.
   * Imperativní řazení: Logika topologického třídění musí být explicitně naprogramována v Prologu.
________________
6. Detailní analýza Varianty B: Optimalizační engine (Clingo + Clorm)
Varianta B přistupuje ke konfiguraci jako k optimalizačnímu problému. Místo psaní pravidel "jak" dosáhnout stavu, definujeme "co" je validní stav a necháme solver najít optimální cestu.
6.1 Technický design
   * Answer Set Programming (ASP): ASP (Clingo) hledá všechny stabilní modely a může mezi nimi vybírat ten optimální (např. pomocí #minimize). To je klíčové, pokud existuje více způsobů, jak dosáhnout cíle.
   * Clorm (Object Relational Mapping): Knihovna Clorm umožňuje definovat Python třídy, které se mapují na predikáty Clinga. To přináší typovou kontrolu (Type Safety).
   * Nomad Parametrizace: Nomad joby lze snadno parametrizovat (Parameterized Jobs). To umožňuje spustit stejný job s různými parametry "optimalizace" (např. --optimize=speed vs --optimize=safety) přímo z n8n.
6.2 Work Breakdown Structure (WBS) - Varianta B (Nomad)
ID
	Úkol (Task Name)
	Detailní popis a technické poznámky
	Závislosti
	Odhad (Opt/Pes)
	Komplexita
	B.1
	Příprava Infrastruktury
	Setup Clingo a Nomad
	

	3 / 6 MD
	Medium
	B.1.1
	Docker Image (Clingo)
	Vytvoření Dockerfile s clingo, python3 a clorm. Instalace přes conda nebo pip. Minimalizace vrstev pro rychlý deploy v Nomadu.
	-
	0.5 / 1 MD
	Low
	B.1.2
	Nomad Job Template
	Vytvoření parametrizovaného Nomad jobu. Využití meta stanza pro předání parametrů z n8n do kontejneru (např. TIMEOUT, OPTIMIZATION_LEVEL).
	B.1.1
	0.5 / 1 MD
	Medium
	B.1.3
	Clorm Models
	Definice Python tříd dědících z clorm.Predicate. Např. class Field(Predicate): name=.... Mapování na JSON z API.
	-
	1 / 2 MD
	Medium
	B.1.4
	Obsidian LP Parser
	Adaptace parseru z Varianty A pro syntaxi ASP (.lp soubory). Extrakce #minimize direktiv.
	-
	1 / 2 MD
	Low
	B.2
	Controller (Modeling)
	Generování instancí problému
	B.1
	6 / 11 MD
	High
	B.2.1
	Data Fetching
	Znovupoužití logiky z A.2 pro stahování dat z YouTrack API.
	-
	2 / 4 MD
	Medium
	B.2.2
	Grounding (Faktizace)
	Konverze API objektů na Clorm instance. Pozor na "Grounding Bottleneck" – neloadovat transakční data (Issues), pouze metadata!.
	B.2.1
	2 / 4 MD
	High
	B.2.3
	Cost Definition
	Definice cenové funkce pro operace. Např. cost(delete_field, 100)., cost(create_field, 1). – preference nedestruktivních změn.
	-
	1 / 1 MD
	Medium
	B.3
	Logic Core (Solving)
	Implementace ASP omezení
	B.2
	10 / 18 MD
	Very High
	B.3.1
	Hard Constraints
	Definice pravidel integrity: :- target_field(F), not curr_field(F). (Stav, kdy chybí cílové pole, je nepřípustný).
	B.2.2
	2 / 4 MD
	High
	B.3.2
	Generation Rules
	Implementace "Choice Rules": { action(create(F)) ; action(keep(F)) } 1 :- target_field(F). (Solver volí jednu z akcí).
	B.3.1
	2 / 4 MD
	Very High
	B.3.3
	Minimization
	Aplikace optimalizace: #minimize { C,A : action(A), cost(A, C) }. Minimalizace celkové ceny operací.
	B.3.2
	1 / 2 MD
	High
	B.3.4
	Sequencing Logic
	Nutnost zavést logický čas T (action(A, T)) nebo post-processing v Pythonu pro seřazení.
	B.3.3
	3 / 5 MD
	Very High
	B.3.5
	Solver Tuning
	Ladění parametrů Clinga (--heuristics, --restarts) v kontextu Nomad resources (CPU limits).
	B.3.4
	2 / 3 MD
	High
	B.4
	Actuator (Execution)
	Interpretace modelu
	B.3
	4 / 8 MD
	High
	B.4.1
	Model Parsing
	Extrakce faktů action(...) ze stabilního modelu pomocí Clorm dotazů.
	B.3.5
	1 / 2 MD
	Low
	B.4.2
	Sequencing (Fallback)
	Pokud logika času v B.3.4 selže nebo bude moc pomalá, implementace topologického třídění v Pythonu (NetworkX) nad výstupem solveru.
	B.4.1
	2 / 4 MD
	Very High
	B.4.3
	Execution Loop
	Spuštění API volání. Stejné jako A.4.x.
	-
	1 / 2 MD
	Medium
	6.3 Hodnocení Varianty B
   * Výhody:
   * Globální optimalizace: Clingo garantuje nalezení nejlepšího řešení. To je neocenitelné při složitých migracích.
   * Robustnost: Osvědčeno v HPC komunitě (Spack).
   * Nevýhody & Rizika:
   * Sequencing Problem: Modelování času/pořadí v ASP je obtížné a zvyšuje stavový prostor exponenciálně.
   * Nomad Resource Usage: ASP solveři mohou být nároční na paměť (Grounding phase). Nomad joby musí mít nastavené adekvátní limity paměti, jinak je OOM Killer ukončí.
________________
7. Kritické zhodnocení a doporučení
Pro implementaci v prostředí definovaném v zadání (zkušený tým, moderní nástroje, Nomad) doporučuji Hybridní přístup:
Primární volba: Varianta A (SWI-Prolog + Janus) běžící jako Nomad Batch Job.
   * Důvod: Nomad exceluje v orchestraci krátkých, jednorázových úloh. Rychlý start Prologu a nízká paměťová náročnost z něj dělají ideálního kandidáta pro tento typ workloadu.
   * Janus umožňuje týmu psát složité I/O logiky v Pythonu (který ovládají) a logiku v Prologu.
Použití Varianty B doporučuji vyhradit pro specifické sub-problémy, jako je optimalizace přiřazení licencí, kde se jedná o kombinatorickou optimalizaci.
Implementační Roadmapa (Next Steps):
   1. Den 1-3: Setup Docker image s SWI-Prolog a Janus. Vytvoření základního batch.nomad jobu a test nasazení do clusteru.
   2. Den 4-7: Vytvoření "Sensing" vrstvy v Pythonu pro stažení schématu YouTracku do JSON.
   3. Den 8-14: Implementace ontologie v Prologu a základních pravidel depends_on.
   4. Den 15+: Integrace do n8n (HTTP Request node -> Nomad API /v1/jobs -> POST).
8. Budoucí výhled: Neuro-symbolická AI a MCP
V horizontu 1-2 let se otevírá možnost integrace Model Context Protocol (MCP).
   * Vize: AI agenti (např. v editoru Windsurf nebo Claude) budou schopni přímo interagovat s naším Prolog serverem přes MCP.
   * Scénář: Vývojář se zeptá v IDE: "Proč nemohu smazat pole Priority?". LLM přes MCP zavolá Prolog predikát, který běží v Nomad kontejneru jako "System Job" nebo "Service", Prolog vrátí logické zdůvodnění a LLM to vysvětlí lidskou řečí.