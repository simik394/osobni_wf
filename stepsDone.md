
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

