#!/bin/bash

# Zkontrolujeme zadání cílové složky
TARGET_DIR="${1:-/home/sim/Obsi/Prods/04-škola/Předměty/mgr4}"
INSIS_DIR="/home/sim/Obsi/Prods/01-pwf/integrations/academic/insis"
DOWNLOADS_DIR="$INSIS_DIR/insis_downloads"
MOODLE_DIR="$INSIS_DIR/../moodle/moodle_downloads"
PROFILES_JSON="$INSIS_DIR/_dumps/insis_subject_profiles.json"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Cílová složka $TARGET_DIR neexistuje, vytvářím..."
    mkdir -p "$TARGET_DIR"
fi

if [ ! -f "$PROFILES_JSON" ]; then
    echo "Chyba: Soubor $PROFILES_JSON nebyl nalezen."
    exit 1
fi

# Počítáme s tím, že jq vypsal ID a úplný název oddělené mezerou
jq -r '.[] | "\(.id) \(.name)"' "$PROFILES_JSON" | while read -r sys_id full_name; do
    # Získáme první slovo z názvu
    first_word=$(echo "$full_name" | awk '{print $1}' | tr '/' '-')
    
    # Ověříme, zda první slovo vypadá jako kód předmětu na VŠE (např. 4IT415, 1BP426, 44F402)
    if [[ "$first_word" =~ ^[0-9A-Z]{4,8}$ ]]; then
        subject_code="$first_word"
    else
        # Pokud název nezačíná klasickým statusem, použijeme numerické ID (např. 215406 u 'IS/ICT Project Management')
        subject_code="$sys_id"
    fi

    echo "--------------------------"
    echo "Zpracovávám předmět: $subject_code (původní název: $full_name)"
    
    SUBJECT_DIR="$TARGET_DIR/$subject_code"
    
    # 1. Vytvoření složky předmětu
    if [ ! -d "$SUBJECT_DIR" ]; then
        echo " -> Vytvářím složku $SUBJECT_DIR"
        mkdir -p "$SUBJECT_DIR"
    else
        echo " -> Složka $SUBJECT_DIR již existuje."
    fi

    # 2. Hledání stažených souborů k předmětu v Dokumentovém serveru INSIS
    # Hledáme složku, jejíž název obsahuje kód předmětu. Pouze directory (type d).
    # Výstup si uložíme do pole.
    IFS=$'\n' read -rd '' -a matching_dirs <<<"$(find "$DOWNLOADS_DIR" -type d -name "*$subject_code*" 2>/dev/null)"
    
    if [ ${#matching_dirs[@]} -eq 0 ]; then
        echo " -> Pro předmět $subject_code nebyly v insis_downloads nalezeny žádné složky."
    else
        # Iterujeme přes nalezené složky
        for src_dir in "${matching_dirs[@]}"; do
            # Vyloučíme případné prázdné nebo invalidní cesty
            if [ -z "$src_dir" ] || [ ! -d "$src_dir" ]; then
                continue
            fi
            
            echo " -> Nalezena stažená složka: $src_dir"
            
            # Název linku
            # V Linuxu bohužel samotný symlink nese oprávnění cílového adresáře a nelze samostatně měnit (symlinky mají vždy 777).
            # Pojmenujeme ho tak, aby bylo na první pohled zjevné, že se jedná o read-only zdroj.
            LINK_NAME="Veřejný dokumentový server_READONLY"
            LINK_PATH="$SUBJECT_DIR/$LINK_NAME"
            
            # Pokud link již existuje, smažeme ho a vytvoříme znovu, aby ukazoval aktuálně
            if [ -L "$LINK_PATH" ]; then
                rm "$LINK_PATH"
            fi
            
            if [ ! -e "$LINK_PATH" ]; then
                # Vytvoření symlinku
                ln -s "$src_dir" "$LINK_PATH"
                echo " -> Vytvořen link: $LINK_PATH -> $src_dir"
            else
                echo " -> Upozornění: Na cestě $LINK_PATH již existuje soubor/složka, která není symlink!"
            fi
        done
    fi

    # 3. Hledání stažených souborů z Moodle
    IFS=$'\n' read -rd '' -a moodle_dirs <<<"$(find "$MOODLE_DIR" -maxdepth 1 -type d -name "*$subject_code*" 2>/dev/null)"
    
    if [ ${#moodle_dirs[@]} -eq 0 ]; then
        echo " -> Pro předmět $subject_code nebyly v moodle_downloads nalezeny žádné složky."
    else
        for src_dir in "${moodle_dirs[@]}"; do
            if [ -z "$src_dir" ] || [ ! -d "$src_dir" ]; then
                continue
            fi
            
            echo " -> Nalezena Moodle složka: $src_dir"
            LINK_NAME="Moodle_Materiály_READONLY"
            LINK_PATH="$SUBJECT_DIR/$LINK_NAME"
            
            if [ -L "$LINK_PATH" ]; then
                rm "$LINK_PATH"
            fi
            
            if [ ! -e "$LINK_PATH" ]; then
                ln -s "$src_dir" "$LINK_PATH"
                echo " -> Vytvořen link: $LINK_PATH -> $src_dir"
            else
                echo " -> Upozornění: Na cestě $LINK_PATH již existuje soubor/složka, která není symlink!"
            fi
        done
    fi
done

echo "Hotovo."
