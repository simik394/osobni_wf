---
id: TODO
aliases: []
tags: []
---
# vision
- [ ] reM plně/efektivně/správně integrováno do noteTaking/creative flow
	 - [ ] pomocí tagů označovat v reM soubory k automatickému zpracování (hodnoty tagů půjdou použit jako vstupní parametry pro dané auto-zpracování)
- [ ] abych mohl z reM dělat poznámky přímo do nejfrekventovaněji navštěvovaných míst 

- [ ] 1. Poznámky z reM tahat do gDocs.
- [ ] 2. Vybrané části z gDocs tahat na konkrétní místa v Obsidianu.

# milestones

- [ ] Nainstalovat na oci instanci pop os

- [ ] reM jako kontroler(klávesnice) pro mobil =mobilní terminál

- [ ] kdybych mohl z reM zařazovat nebo i přímo kreslit do Obsidianu?

# just do

- [ ] Todos ve složce s generovaným id v názvu. Jakože ne v jednom souboru, ale ve složce jako jednotlivé soubory. Asi pomocí quickAdd pluginu nebo nějakých šablon a možná better new pluginu pokud existuje.

- [ ] Asi chci dodělat nejdříve nastavení daily notes v nvimu, ale jsou tam drobné vychytávky, které ale nejsem schopný obraz.. půjdu do lehnout.

- [ ] nastavit fole/todo-comments tak, aby nezvýrazňoval splněné úkoly. Nebo nastavit, aby se splněné úkoly rovnou někam šoupaly?
- [ ] Nebo je nastavit podle znaků v řádku za slovem. Pak by mohly být zvýrazněny pouze nejdůležitější, nebo aktuální úkoly a dalo by se s tím mnohem více vyhrát, než když bych vycházel jen z několika stavů, kterými se dá todo zaškrtnout.

- [ ] nastavit Daily notes v nvim.obsidianu

- [ ] chci barevný nadpisy? [[lukas-reinekeheadlines.nvim This plugin adds horizontal highlights for text filetypes, like markdown, orgmode, and neorg.]]


- [ ] vytvořit repozitář pro můj nvim config.

- [ ] sestavit věci, které chci měřit v každém jednom dni.
- [ ] zakomponovat Heatmap calendar do Obsidianu.

- [ ] nastavit přepínání windows desktopů na G klávesy na klávesnici abych nemusel mačkat tři tlačítka


- [ ] ukli I'mdit tabuli+ vypsat FGProd energiser a blockers

- [x] rozebrat Contexts v reM. Počínaje co-Škola

### PC desktop
- [ ] vyčistit lokální disky v PC(záloha do storj a dalších vhodných lokací )

- [ ] připravit dev-os které bude na .vhdx (asi Pop_OS!) a bude představovat doplňek k game-os (základ aktuálního OSmixu)


### MSI NTB
- [ ] instalovat pluginy do zotera
- [ ] přenést configuraci custom frames do Obsidianu

# research do
## try 

### něco

### copyQ
- [ ] roztřídit obsah z copyQ na vhodnější místa -> Je potřeba vymyslet struktury do kterých daný obsah přenést

### Mobil
- [ ] Umožnit verzování projektových složek z telefonu 
    - [ ] uklidit repozitáře v mgit aplikaci NEBO vyřešit verzování přes halvarm


### Halvarm
- [ ] Umožnit verzování projektových složek z halvarmu
    - [ ] nastavit autorizaci pro halvarm instalaci gitu

- [x] možnost spouštět gui aplikace na linuxu bez gui přes X11 na vzdáleném počítači

### focení
- [ ] Vyřešit zálohování fotek
### reMarkable2
- [ ] dualbooting reM
- [ ] nastavit syncthing na pdfs v reM a nastavit zotero odkazy na ty soubory, nebo 
- [ ] abych mohl na telefonu dělat poznámky do PDFs organizovaných v Zoteru a ty změny se propisovaly do reM 

- [ ] využít nekonečné úložiště na pdfs v reM cloudu -> FREE cloud archive storage

## experiment

### NeoVim
- [ ] vytvořit repozitář pro můj nvim config
- [ ] nastavit daily notes v nvim Obsidian
- [ ] jak fungují nvim obsidian workspaces?

### MS Copilot
- [ ] Vyzkoušet jak si s otázkou na hormony zmíněné v FGProd poradí bing chat, možná i jiná chaty 

### NotebookLM 

- [x] vyzkoušet jestli notebookLM umí číst textové soubory na gitu _ANO pokud je zadaná adresa raw zobrazení z prohlížeče_  ^ntbLMtestctenimdsouboruzgitu01

- [ ] vyzkoušet zda NotebookLM umí aktualizovat i obsah načtený z webů

- [ ] vyzkoušet zda NotebookLM by uměl číst obrázky z normálních PDF s a ne z reM.
- [ ] co takhle exportovat z reM jen obrázky místo pdfs

just done
- [x] zotero databáze se úsěšně syncuje včetně pdfs do telefonu

# stepsDone
nakonfigurování rclone-personal_gDrive
zprovoznění podman-compose

opravení apt na halvarm-ubuntu (odinstalováním (purgnutím) texlive balíčku, kterým jsem to v první řadě zkazil)
provizorní opravení syncinthgu na halvarm-ubuntu pomocí tmux detach, protože když jsem ho jako ubuntu spustil prostě z řádky. Ikdyž přes systemd services to nefachčilo
po tak 5-6hod. trapošení se mi povedlo částečně zprovoznit otevírání terminálu na lokaci dané poznámky v Obsidianu
- přeinstalovat Obsidian i nvim aby nebyly jako appimage(nvim). Obojí jsem nakonec nainstaloval přes snap a pomohlo to.
- nějaký rozdíl mezi terminálem co spustí Obsidian a tím co si spustím já (v obsidianem otevřeném terminálu není možné startovat nvim s využitím standartního NVIM_APPNAME proměnné. Dokud tam nenacpu -u nebo -S a pŕímo cestu k init.lua souboru, pak to funguje ALE pouze do tý doby než zkusím přidat custom plugins do kickstart nvim konfigurace.)

Zprovoznění ollama v kontejneru s GPU
Nalezení (skrz vyzkoušení všech dostupných variant) obsi pluginů, které fungují s gemini nebo ollamou

Vylepšéní standartu názvosloví mých poznámek, protože všechny ostaní typy krom "steps" dostal místo prvních pár cifer roku vlastní 2-4 písmený prefix takže je teď mnohem snažší dělat reasoning okolo, protože si nemusím konstantě pamatovat, nebo odvozovat, která stránka co vlastně reprezentuje, ale stačí se podívat na začátek jejího názvu.
Mimojiné jsem rozšířil názvoslovný standard i do repozitáře Research a doučesal odpovídajícím způsobem zbývající i jediné další "aktivně používané" repozitáře (pwf, škola, Research)


___
from: stepsDone on: 2025-07-26 16:07:15