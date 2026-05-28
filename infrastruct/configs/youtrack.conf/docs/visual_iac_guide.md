# Visual IaC Guide: Configuring YouTrack with Draw.io Diagrams

Tento průvodce vysvětluje, jak používat vizuální správu konfigurace (**Visual IaC**) pro YouTrack pomocí **Draw.io** diagramů. Tato implementace je plně integrovaná, extrémně rychlá díky kompilovanému jazyku **Nim** a sémanticky interpretovaná v **SWI-Prologu**.

---

## 1. Architektura řešení

Proces zpracování diagramů se skládá ze tří hlavních kroků:

1. **Objevení diagramů**: Controller transparentně prohledává adresář s konfigurací na přítomnost `.drawio` diagramů.
2. **Syntaktická analýza (Nim)**: Zkompilovaná binárka `drawio2prolog` (naprogramovaná v Nim s nulovými závislostmi) dekomprimuje a přečte XML strukturu diagramu (`mxCell` a `<object>` elementy) a vygeneruje strukturální Prolog fakta:
   - `diagram_node(Id, Style, Label, MetadataList)`
   - `diagram_edge(Id, SourceId, TargetId, Style, Label)`
3. **Sémantický překlad (Prolog)**: V `core.pl` jsou definována čistě deklarativní pravidla, která tyto strukturální vztahy (spojení hranami, metadata) transformují na konkrétní YouTrack konfiguraci (projekty, vlastní pole, bundly, výchozí hodnoty a startovací úkoly).

---

## 2. Jak psát Draw.io diagramy pro YouTrack

Aby byly prvky diagramu správně interpretovány, musí obsahovat správná metadata. V Draw.io můžete metadata k jakémukoliv prvku přidat dvojklikem a stisknutím **Ctrl+M** (nebo pravým tlačítkem myši -> *Edit Data*).

Každý prvek diagramu musí mít vlastnost `type`. Níže jsou uvedeny povolené typy a jejich vlastnosti:

### A. Projekt (`type="project"`)
Reprezentuje projekt v YouTracku.
- **Label (text uzlu)**: Celý název projektu (např. `"Demo Project"`)
- **shortName**: Zkratka projektu (např. `"VDEMO"`)
- **leader**: (Volitelně) Uživatelské jméno vedoucího projektu

### B. Vlastní Pole (`type="field"`)
Reprezentuje custom field projektu. Musí být spojen hranou s projektem, nebo mít explicitní project metadata.
- **Label (text uzlu)**: Název pole (např. `"State"`, `"Priority"`)
- **fieldType**: Typ pole (např. `"state"`, `"enum"`, `"string"`, `"integer"`)
- **defaultValue**: (Volitelně) Výchozí hodnota pole
- **project**: (Volitelně) Zkratka projektu, pokud není pole připojeno vizuální hranou

### C. Bundle (`type="bundle"`)
Sada hodnot pro pole typu enum/state. Musí být spojen hranou s polem typu `field`.
- **Label (text uzlu)**: Název bundlu (např. `"VDEMO State Bundle"`)
- **bundleType**: `"state"` (pro stavové bundly) nebo `"enum"` (pro výčtové bundly)

### D. Hodnoty (`type="state_value"` nebo `type="enum_value"`)
Hodnoty náležící do bundlu. Musí být spojeny hranou s uzlem typu `bundle`.
- **Label (text uzlu)**: Název hodnoty (např. `"Open"`, `"Done"`, `"High"`)
- **resolved**: (Pouze pro `state_value`) `"true"` nebo `"false"` pro nastavení stavu vyřešení úkolu.

### E. Startovací úkol (`type="seed"` nebo `type="issue_seed"`)
Vzorová data (úkoly) pro nově vytvořené projekty. Musí být spojen hranou s uzlem typu `project`.
- **Label (text uzlu)**: Titulek/Sumář úkolu
- **description**: Popis úkolu
- **issueType**: Typ úkolu (např. `"Task"`, `"Bug"`, výchozí je `"Task"`)
- **priority**: Priorita úkolu (např. `"Normal"`, `"High"`, výchozí je `"Normal"`)

---

## 3. Příklad XML struktury Draw.io diagramu

Níže je ukázka dekomprimovaného a validního Draw.io XML souboru, který obsahuje kompletní Visual IaC strukturu:

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    
    <!-- Projekt VDEMO -->
    <object id="proj_node" label="Visual Demo Project" type="project" shortName="VDEMO" leader="jules">
      <mxCell parent="1" vertex="1" style="rounded=1;fillColor=#FFF;"/>
    </object>
    
    <!-- State Field -->
    <object id="field_state" label="State" type="field" fieldType="state" defaultValue="Open">
      <mxCell parent="1" vertex="1" style="shape=parallelogram;"/>
    </object>
    <mxCell id="edge_proj_state" source="proj_node" target="field_state" edge="1" parent="1"/>
    
    <!-- State Bundle -->
    <object id="bundle_state" label="VDEMO State Bundle" type="bundle" bundleType="state">
      <mxCell parent="1" vertex="1" style="ellipse;"/>
    </object>
    <mxCell id="edge_state_bundle" source="field_state" target="bundle_state" edge="1" parent="1"/>
    
    <!-- State Values -->
    <object id="state_val_open" label="Open" type="state_value" resolved="false">
      <mxCell parent="1" vertex="1" style="rhombus;"/>
    </object>
    <object id="state_val_done" label="Done" type="state_value" resolved="true">
      <mxCell parent="1" vertex="1" style="rhombus;"/>
    </object>
    <mxCell id="edge_val_open" source="state_val_open" target="bundle_state" edge="1" parent="1"/>
    <mxCell id="edge_val_done" source="state_val_done" target="bundle_state" edge="1" parent="1"/>
    
    <!-- Vzorový úkol (Seed) -->
    <object id="seed_issue" label="Welcome to Visual IaC" type="seed" description="Hello from drawio" issueType="Task" priority="Normal">
      <mxCell parent="1" vertex="1" style="shape=note;"/>
    </object>
    <mxCell id="edge_seed_proj" source="seed_issue" target="proj_node" edge="1" parent="1"/>
  </root>
</mxGraphModel>
```

---

## 4. Výhody tohoto přístupu

1. **Nulový AI Slop**: Parser je staticky zkompilovaný v Nim, sémantika je vyjádřena v čisté logice Prologu. Žádné tipování, stoprocentní determinismus.
2. **Přehlednost**: Složité sítě vlastních polí, workflow vazeb a rolí můžete jednoduše nakreslit a okamžitě zrcadlit do YouTracku.
3. **Transparentní koexistence**: Diagramy fungují společně s YAML a Lua konfiguracemi. Můžete mít část deklarovanou v YAML a vizuální struktury v diagramu, a systém je bezpečně sloučí dohromady.
