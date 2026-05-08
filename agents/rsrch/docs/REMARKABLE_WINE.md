# reMarkable Wine Desktop Integration

Tento projekt řeší integraci aplikace reMarkable Desktop (běžící přes Wine v Dockeru) přímo do Linuxového prostředí (GNOME/KDE) s důrazem na čistý vizuál a plynulý workflow bez nutnosti používat terminál.

## 📂 Souborová struktura a cesty

### Systémové soubory
- **Launcher (Spouštěč):** `/home/sim/.local/bin/remarkable-wine-launcher.sh`
  - Spravuje `xhost` oprávnění a životní cyklus Docker kontejneru.
- **Desktop Entry:** `/home/sim/.local/share/applications/remarkable-wine.desktop`
  - Umožňuje připnutí do taskbaru a definuje kontextové menu (Restart, Reset).
- **Ikona:** `/home/sim/.local/share/icons/remarkable-wine.png`
  - Vlastní ikona s burgundským detailem, která ladí s nativní rM aplikací.

### Data a Wine Prefix
- **Hlavní data (Persistentní):** `/home/sim/.local/share/remarkable-wine-data/`
  - Zde je uložen celý Wine prefix. Pokud ho smažete, aplikace se při příštím startu inicializuje znovu (čistý stav).

---

## 📥 Import a Export souborů

Wine aplikace běží v izolovaném prostředí, které simuluje Windows souborový systém.

### Kde najdu vyexportované soubory?
Vše, co uložíte na virtuální disk `C:\`, se ve skutečnosti ukládá do vašeho Linuxu sem:
```bash
/home/sim/.local/share/remarkable-wine-data/drive_c/
```

**Příklad:**
- Uloženo ve Wine: `C:\users\remarkable\Documents\moje_poznámka.pdf`
- Najdete v Linuxu: `~/.local/share/remarkable-wine-data/drive_c/users/remarkable/Documents/moje_poznámka.pdf`

### Jak nahrát soubory do aplikace?
1. Zkopírujte soubory z Linuxu přímo do složky `drive_c` (např. do `Documents` nebo `Downloads`).
2. V aplikaci reMarkable Wine zvolte "Import" a proklikejte se na disk `C:\` do dané složky.

---

## 🛠️ Údržba a řešení problémů

### Restart aplikace
Pokud aplikace zamrzne, klikněte **pravým tlačítkem** na ikonu v taskbaru a zvolte **"Restart reMarkable Wine"**. To vynutí ukončení kontejneru a jeho nové spuštění.

### Kompletní reset (Wipe)
Pokud se Wine prefix poškodí, zvolte v kontextovém menu **"Force Reset Wine Prefix"**. 
> [!CAUTION]
> Tato akce smaže veškerá lokální data aplikace (nastavení, stažené sešity) a vynutí nové přihlášení k reMarkable účtu.

---

## 🎨 Design Notes
Ikona byla navržena tak, aby respektovala měřítko a font nativní aplikace reMarkable, ale zároveň byla jasně odlišitelná díky subtilnímu burgundskému symbolu v rohu. Vyhýbáme se "AI slop" prvkům (náhodná tlačítka, stíny, vnořené rámečky).
