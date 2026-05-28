# YouTrack IaC: Programovatelná Lua Konfigurace (Uživatelská Příručka)

Tato příručka popisuje, jak využít plnou sílu **programovatelného jazyka Lua** pro správu deklarativní konfigurace JetBrains YouTrack místo tradičního, statického YAML formátu.

---

## 1. Proč Lua místo YAML?

Tradiční konfigurátory (např. YAML) vyžadují masivní kopírování kódu, pokud spravujete více projektů s podobnými poli a tabulemi. Lua přináší do infrastruktury YouTracku **plnohodnotný programovací model**:

* **Žádné duplicity (DRY)**: Společná pole, agilní tabule nebo reporty můžete zabalit do opakovaně použitelných funkcí.
* **Dynamické generování**: Nové projekty nebo týmy můžete generovat v cyklech (`for`).
* **Modularita**: Konfiguraci můžete rozdělit do více souborů a skládat ji pomocí standardního Lua příkazu `require()`.
* **In-memory rychlost**: Lua se načítá a vyhodnocuje přímo v paměti Python procesu přes vestavěný C-bridge runtime (`lupa`).

---

## 2. Architektura: Je v Lua dostupné opravdu VŠE?

**Ano, na 100 %!** Náš parser funguje jako transparentní preprocessing vrstva:
1. Vyhodnotí tvůj Lua skript přímo v paměti přes Lupa interpreter.
2. Výsledná Lua tabulka se rekurzivně zkonvertuje na standardní Python slovník/seznam.
3. Tento slovník je předhozen **přesně stejnému Pydantic schématu** (`YouTrackConfig`), které dříve validovalo YAML.

To znamená, že **jakákoliv vlastnost a validace**, která fungovala v YAML, funguje naprosto identicky i v Lua konfiguraci. Pydantic nadále hlídá typovou správnost, povinná pole a Prolog logic engine detekuje případný drift.

---

## 3. Kompletní Referenční Příručka (Syntax Mapping)

Lua tabulky se zapisují pomocí kudrnatých závorek `{}` a klíče se definují pomocí `=` místo `:`. Pole v Lua začínají indexem `1` (nikoliv `0`).

Zde je kompletní přehled mapování všech YouTrack IaC objektů:

```lua
-- project.lua
return {
  -- 1. GLOBÁLNÍ UŽIVATELÉ, SKUPINY A ROLE
  users = {
    { login = "johndoe", fullName = "John Doe", email = "john.doe@company.com" }
  },
  groups = {
    { name = "Developers", users = { "johndoe" }, roles = { "Developer" } }
  },
  roles = {
    { name = "Developer", description = "Standard Dev Role", permissions = { "Read Issue", "Create Issue", "Update Issue" } }
  },

  -- 2. SDÍLENÉ ČÍSELNÍKY (BUNDLES)
  bundles = {
    PriorityBundle = { "Showstopper", "High", "Normal", "Low" },
    StateBundle = {
      { name = "Open", resolved = false },
      { name = "In Progress", resolved = false },
      { name = "Fixed", resolved = true }
    }
  },

  -- 3. GLOBÁLNÍ WORKFLOWS (Pravidla se skripty)
  workflows = {
    {
      name = "global-rules",
      rules = {
        {
          name = "assignee-notifier",
          type = "on-change",
          script = "exports.rule = { ... JavaScript code ... }" -- Inline JS
          -- nebo: script_file = "rules/notifier.js"
        }
      }
    }
  },

  -- 4. GLOBÁLNÍ REPORTY
  reports = {
    {
      name = "Global Agile Burndown",
      type = "burndown",
      projects = { "DEV", "INFRA" },
      dateRange = "current_sprint",
      estimationField = "Story Points"
    }
  },

  -- 5. VLASTNÍ VAZBY MEZI ÚKOLY (ISSUE LINK TYPES)
  issueLinkTypes = {
    {
      name = "Blocks Release",
      sourceToTarget = "blocks release",
      targetToSource = "is blocked by release",
      directed = true,
      aggregation = false
    }
  },

  -- 6. GLOBÁLNÍ ČASOVÝ ROZVRH (TIME TRACKING)
  timeTracking = {
    firstDayOfWeek = 1, -- Pondělí
    minutesLimit = 480, -- 8 hodin denně
    daysOfWeek = { 1, 2, 3, 4, 5 } -- Pracovní dny (Po-Pá)
  },

  -- 7. PROJEKTY A JEJICH SPECIFICKÁ NASTAVENÍ
  projects = {
    {
      name = "Software Development",
      shortName = "DEV",
      leader = "johndoe",
      template = "std-agent-v1", -- Šablona pole a workflow

      -- Projektová vlastní pole
      fields = {
        { name = "Priority", type = "enum", bundle = "PriorityBundle" },
        { name = "State", type = "state", bundle = "StateBundle" }
      },

      -- Projektové Agile tabule
      boards = {
        {
          name = "Sprint Board",
          projects = { "DEV" },
          column_field = "State",
          sprints = { enabled = true },
          visible_to = { "Developers" },
          columns = { "Open", "In Progress", "Fixed" },
          swimlane_field = "Priority"
        }
      },

      -- Projektové přiřazení rolí (Role Assignments)
      role_assignments = {
        { subject = "Developers", type = "group", role = "Developer" }
      },

      -- Projektový Time Tracking
      timeTracking = {
        enabled = true,
        estimationField = "Story Points",
        workItemTypes = { "Development", "Code Review", "Bugfix" }
      },

      -- Project Seeding (Vzorové úkoly při startu prázdného projektu)
      seeds = {
        {
          summary = "Nastavit si lokální prostředí",
          description = "Postupujte podle návodu v README.md v repozitáři.",
          type = "Task",
          priority = "Normal"
        }
      }
    }
  }
}
```

---

## 4. Pokročilé Programové Vzory (Power Patterns)

Zde je ukázka, jak využít plnou sílu programovatelnosti v Lua.

### A. Opakovaně použitelné generátory polí (Shared Generator Functions)
Místo kopírování polí pro každý projekt si vytvoříte funkci, která vygeneruje standardní sadu polí:

```lua
-- Funkce vracející standardní sadu polí s prefixem projektu
local function standard_fields(project_prefix)
  return {
    { name = "State", type = "state", bundle = "StateBundle" },
    { name = project_prefix .. "-Priority", type = "enum", bundle = "PriorityBundle" },
    { name = "Assignee", type = "user" },
    { name = "Story Points", type = "integer" }
  }
end

-- Použití v projektech:
return {
  projects = {
    { name = "Core Engine", shortName = "ENG", fields = standard_fields("ENG") },
    { name = "Web App", shortName = "WEB", fields = standard_fields("WEB") }
  }
}
```

### B. Masivní generování projektů v cyklu (Dynamic Loops)
Máte-li desítky mikro-projektů nebo produktových týmů, můžete je všechny vygenerovat v jednoduché smyčce:

```lua
local teams = {
  { short = "FE", name = "Frontend Team" },
  { short = "BE", name = "Backend Team" },
  { short = "QA", name = "Quality Assurance" }
}

local projects = {}
for _, team in ipairs(teams) do
  table.insert(projects, {
    name = team.name,
    shortName = team.short,
    leader = "johndoe",
    fields = {
      { name = "State", type = "state", bundle = "StateBundle" }
    },
    seeds = {
      { summary = "Welcome to " .. team.name, description = "Let's build great things!", type = "Task" }
    }
  })
end

return {
  projects = projects
}
```

### C. Modulární rozdělení konfigurace (`require()`)
Konfiguraci můžete rozdělit do samostatných souborů pro přehlednost:

Soubor `fields.lua`:
```lua
return {
  { name = "State", type = "state", bundle = "StateBundle" },
  { name = "Priority", type = "enum", bundle = "PriorityBundle" }
}
```

Hlavní soubor `project.lua`:
```lua
-- Načte společná pole ze samostatného souboru
local common_fields = require("fields")

return {
  projects = {
    {
      name = "Modular Project",
      shortName = "MOD",
      fields = common_fields
    }
  }
}
```
*(Poznámka: `require` vyhledává soubory v aktuálním pracovním adresáři a v adresářích definovaných v `package.path`.)*
