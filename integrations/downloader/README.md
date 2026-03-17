# Universal Smart Downloader

Tento repozitář obsahuje komplexní systém pro hromadné a chytré stahování obrázků, galerií a videí napříč různými platformami. Systém se skládá z Bash jádra a volitelného Node.js extraktoru pro Google Chrome.

## Uživatelská příručka (User Doc)

Hlavním komponentem je skript `smart_download.sh`. Umí automaticky rozeznat co se snažíš stáhnout a zvolit ten nejspolehlivější způsob (např. obcházení anti-bot ochran u Reddit, parsování skrytých zdrojů u rule34, atd.).

### Základní použití

1. **Ze schránky (Clipboard):** Zkopíruj si sérii URL odkazů a prostě pusť skript.
   ```bash
   ./smart_download.sh
   ```
   *Skript sám prohledá tvůj clipboard přes CopyQ, xclip, nebo wl-paste, a stáhne obsah do nově vygenerované timestamp složky v `~/Downloads/.*`*

2. **Ze souboru:**
   ```bash
   ./smart_download.sh -i moje_odkazy.txt MojeSuperSlozka
   ```
   *Toto načte odkazy ze souboru `moje_odkazy.txt` a uloží je do `~/Downloads/MojeSuperSlozka`.*

3. **Stahování z aktivních panelů Chrome:**
   Pokud máš v Chrome pootvírány desítky obrázků (tabů), můžeš je stáhnout najednou z běžícího Chrome:
   ```bash
   # (Předpokládá se běžící Chrome s remote debugging na portu 9225)
   node chrome_tabs_downloader.js
   ```
   *Tento Node.js skript se připojí ke Chrome, získá všechna URL na aktivních tabech a roztřídí je podle domény přesouváním do `smart_download.sh`.*

### Pokročilé parametry `smart_download.sh`

```text
USAGE:
  ./smart_download.sh [-v] [-f] [-d] [-q] [-n] [-i file] [folder_name]

OPTIONS:
  -v         Verbose výstup (ukáže detailní debug informace z příkazů jako wget/gallery-dl).
  -f         Flat mode. Soubory nebudou tříděny do podsložek jako /reddit, /rule34. Vše přistane v rootu složky.
  -d         Deep mode. Povolí stahování celých velkých galerií (např. e-hentai archivy).
  -q         Quiet mode. Ideální pro automatizaci. Bude mlčet.
  -n         Odešle desktop notifikaci, když stahování kompletně skončí.
  -i FILE    Vstupní soubor s logy. Můžeš použít '-' pro čtení ze standardního vstupu (stdin).
```

### Ochrana proti duplikátům a Metadata
Bojíš se, že stáhneš něco dvakrát? Skript má **deduplikační paměť**!
1. Po každém úspěšném stažení zapíše metadata (Původní URL, cestu na disku, a timestamp).
2. Metadata se zapisují **globálně** do `~/Downloads/download_metadata.txt` a zároveň **lokálně** do aktuální cílové složky `MojeSlozka/download_metadata.txt`.
3. Před každým stahováním skript filtruje nové odkazy oproti této databázi metadat. Opakovací stahování se přeskočí a šetří čas i místo.


---
---

## Vývojářská příručka (Dev Doc)

Skript `smart_download.sh` byl navržen tak, aby se dal lehce rozšiřovat pro specifické (těžko dostupné) weby. Proces toku funguje následovně:

1. **Čtení ->** Získání formátu URL a vstupů do proměnné.
2. **Kategorizace ->** Rozřazení URLs do bucketů/front (temporární txt soubory jako `$RULE34_URLS`, `$REDDIT_URLS`, etc.).
3. **Deduplikace ->** Porovnání získaných dočasných souborů napříč `download_metadata.txt` (bash `grep -vxf`).
4. **Zpracování bucketů ->** Přečtení temporárních seznamů a jejich prohnání daným nástrojem nebo specifickou extrakcí.

### Jak přidat speciální pravidlo pro nový web

Předpokládejme, že chceš přidat `superdl.com`, který schovává high-res obrázky za speciálním HTML tagem (`<a id="highres">`), podobně jako `rule34.xxx`. Následuj tyhle tři kroky uvnitř zdrojového kódu `smart_download.sh`:

#### 1. Registrace nové fronty (Kolem řádku 165)
Vytvoření bucket text fajlu pro tuto sekci např:
```bash
SUPERDL_URLS="/tmp/superdl_$$.txt"
> "$SUPERDL_URLS"
# Poté nezapomeň tuto proměnnou přidat i do úklidovací zóny rm příkazu na konci souboru a u clean-up quit handlerů.
```

#### 2. Filtrace URL do bucketu (Kolem řádku 175)
Přidej do hlavního `while` bloku rozeznávací `elif`:
```bash
    elif [[ "$url" =~ superdl\.com/gallery/view ]]; then
        echo "$url" >> "$SUPERDL_URLS"
```
*(Pokud dříve web používal `GALLERY_URLS`, odstraň ho odtamtud aby nedošlo k dvojímu downloadu!)*

#### 3. Logika stahování pro tento specifický bucket
Před ukončovací cleanup fázi přidej nový stahovací bash block provádějící tvou novou logiku. Zde můžeš iterovat přes `.txt` frontu, scrapovat specifické bloky paměti a logovat do globálních metadat:

```bash
# Stáhneme specifické SUPERDL.com logiky
SUPERDL_COUNT=$(wc -l < "$SUPERDL_URLS" | tr -d ' ')

if [[ "$SUPERDL_COUNT" -gt 0 ]]; then
    echo "📥 Stahování $SUPERDL_COUNT z webu superdl..."
    SUPERDL_DIR="$OUTPUT_DIR/superdl"
    mkdir -p "$SUPERDL_DIR"

    while IFS= read -r url; do
        [[ -z "$url" ]] && continue

        # Extrakce unikátního linku obejítím stránek:
        # Použijeme např curl k získání stringu z tagu 'highres_btn'
        ORIGINAL_IMAGE_URL=$(curl -sL "$url" | grep -o 'href="[^"]*"' | grep 'highres_btn' | head -n 1 | cut -d '"' -f 2)

        if wget -q -O "$SUPERDL_DIR/obrazek.jpg" "$ORIGINAL_IMAGE_URL"; then
            echo "✓"
            # VELMI DŮLEŽITÉ: Musíš zapsat původní dodanou source URL ($url),
            # tím zajistíš správnou globální deduplikaci pro příšti iterace!
            echo -e "$url\t$SUPERDL_DIR/obrazek.jpg\t$(date -Iseconds)" >> "$GLOBAL_METADATA_FILE"
            echo -e "$url\t$SUPERDL_DIR/obrazek.jpg\t$(date -Iseconds)" >> "$LOCAL_METADATA_FILE"
            ((SUCCESS++))
        else
            echo "❌"
            ((FAILED++))
        fi
    done < "$SUPERDL_URLS"
fi
```

### Závislosti skriptů
- **wget** & **curl** (Fallback pro rychlé image a scrape)
- **Docker** (Pro container images od `mikf123/gallery-dl` a `yt-dlp` u komplexních stahovaček jako twitter nebo reddit preview klíče).
- **Node.js Playwright** (Kromě CDP socketu vyžaduje pro manipulaci nainstalovaný balík `playwright`).
- **Node.js fs modul** (Vestavěný, pro importy Session JSON souborů).

---

## Modul: Tab Session Manager (Migrace a stahovač)

Napsal jsem rovněž Node.js orchestrátor s označením `tsm_downloader.js`, který parsuje masivní JSON exporty z Tab Session Manager pluginu, třídí je a předává pro deduplikované stažení. Skript dokáže dokonce zpětně vzít soubory, které už máš dřív stažené ledabyle a "zahrabané" ve "flat-hierarchii" v Downloads, a sám je detekuje a **přesune do těch správných strukturovaných složek**!

### Jak spustit JSON import

1. Exportuj si ze Session Manageru tvůj JSON záložek (např. `muj_export_záložek.json`).
2. Pusť přes node tento wrapper:
   ```bash
   node /home/sim/Obsi/Prods/01-pwf/integrations/downloader/tsm_downloader.js ~/Downloads/muj_export_záložek.json
   ```
3. Uvidíš log:
   - Skript detekuje, do kterých Chrome Group IDs dané záložky patří.
   - Vyzobe z metadata stávající soubory, *přesune je do kategorizovaných skupin* a *obnoví záznam v `download_metadata.txt`*.
   - Pro ty položky, které **ještě nemáš vůbec stažené**, zaktivuje standardní `smart_download.sh` pro okamžité hromadné stáhnutí přímo do oněch přesných skupin. Místo 400 plochých odkazů tak budeš mít čistý adresář s např. `Group_1988953109_rule34`.
