# Lessons Learned - Ingesce Moodle & NotebookLM

## 🛠 Technické poznatky
1. **Container Drift**: Změny v lokálních zdrojích `rsrch` (např. přidání NotebookLM URL do `tab-pool.js`) nejsou automaticky reflektovány v běžícím kontejneru na `halvarm`. Bylo nutné provést manuální patch pomocí `docker cp` distů.
2. **CDP Konektivita**: Pokud `config.json` v kontejneru selže (např. kvůli nesouladu CWD), nejspolehlivější cesta je explicitní předání `BROWSER_CDP_ENDPOINT` přes environmentální proměnné.
3. **Plošná Ingesce (Flattening)**: Moodle stahuje materiály do hluboké struktury složek. Před nahráváním do NotebookLM je efektivnější soubory zploštit do jedné složky, což eliminuje chyby při expanzi globů a zjednodušuje hromadný upload.

## 📋 Stav Ingesce
- **4IT415**: 33 souborů nahráno do notebooku "4IT415 Informační modelování".
- **4IT414**: 47 souborů nahráno do notebooku "4IT414 Řízení projektů IS_ICT".
- **Dashboards**: Obsidian dashboardy aktualizovány (včetně linků na Enterprise Assistant).
