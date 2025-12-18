
## dávky
### 3.3 Ideální velikost dávky (Optimal Chunk Size)

Na základě průniku všech omezení (Ingress 50MB, Memory limits, Execution time 6 min) je optimální velikost payloadu pro textová data v rozmezí **2 MB až 5 MB**.

**Zdůvodnění pro 2–5 MB:**

- **Kapacita:** 5 MB čistého textu odpovídá přibližně **1 milionu znaků** (pokud uvažujeme kódování UTF-8 a běžný text).
    
- **Vztah k limitu dokumentu:** Google Dokument má tvrdý limit cca **1,02 milionu znaků**. To znamená, že jeden optimální payload (chunk) o velikosti 2–5 MB často koresponduje s naplněním jednoho celého cílového Google Dokumentu. Toto zjednodušuje logiku "kdy založit nový dokument".   
    
- **Rychlost zpracování:** Zpracování 2 MB textu v Apps Scriptu (iterace, regexy, transformace) trvá typicky 30–90 sekund. To poskytuje obrovskou bezpečnostní rezervu do limitu 6 minut, a to i v případě, že jsou servery Google momentálně vytížené.
    
- **Spolehlivost:** Přenos 2 MB je rychlý i na pomalejších připojeních a minimalizuje riziko `413 Payload Too Large` chyb.
## 4. Architektura kompilátoru: Google Docs API a `batchUpdate`

Pro efektivní kompilaci dokumentace je nutné opustit standardní třídu `DocumentApp` (např. metody `body.appendParagraph()`) a využít nízkoúrovňové **Google Docs API** (Advanced Service) prostřednictvím metody `Docs.Documents.batchUpdate`. Toto je klíčový technický posun nutný pro výkon.

### 4.1 Nevýhody standardního `DocumentApp`

Třída `DocumentApp` je vysokoúrovňová abstrakce. Každé volání metody, jako je `appendParagraph` nebo `setBold`, interně provádí samostatnou komunikaci se serverem, validaci a aktualizaci modelu dokumentu.

- **Latence:** V cyklu, který zpracovává tisíce řádků Markdownu, se tyto milisekundy sčítají. Zpracování velkého dokumentu může trvat desítky minut.
    
- **Kvóty:** Každá operace se může započítávat do kvóty zápisů (Write Requests), což rychle vede k vyčerpání limitu 60 requestů za minutu.   
    

### 4.2 Síla `batchUpdate`

Metoda `Docs.Documents.batchUpdate` umožňuje odeslat jednu masivní HTTP žádost, která obsahuje pole `requests`. Toto pole může obsahovat tisíce drobných operací (vložení textu, formátování, tvorba seznamů), které se na serveru provedou **atomicky**.   

- **Atomicity:** Buď se provedou všechny změny, nebo žádná. To zajišťuje integritu dokumentu.
    
- **Výkon:** Jedna HTTP žádost = jedna režie. Zpracování je o řády rychlejší.
    
- **Quota Efficiency:** Celý `batchUpdate` se počítá jako **1 write request**, i když obsahuje 5000 pod-operací. To je "game changer" pro obcházení rate limitů.   
    

### 4.3 Algoritmická strategie: Editace pozpátku (Reverse Order Insertion)

Při vkládání obsahu přes `batchUpdate` narážíme na problém s indexy. Google Docs je lineární sekvence znaků. Pokud vložíte text na začátek dokumentu (index 1), všechny následující elementy se posunou a jejich indexy se změní.

Pro efektivní kompilaci je doporučeno a dokumentací Google zdůrazněno pravidlo: **Editujte pozpátku**. Nicméně, při kompilaci vaultu (kde chceme text A, pak text B, pak text C) je editace pozpátku (nejprve vložit C, pak B, pak A) logisticky náročná, protože musíme mít data načtená celá předem.   

**Alternativní strategie pro Append (Přidávání na konec):** Pro sekvenční kompilaci je vhodnější využít **EndOfSegmentLocation**. JSON struktura pro vložení textu na konec dokumentu vypadá takto:

JSON

```
{
  "insertText": {
    "text": "Text z vašeho Obsidianu\n",
    "endOfSegmentLocation": {
      "segmentId": "" // Prázdné = Body dokumentu
    }
  }
}
```

Tato operace nevyžaduje znalost přesného indexu a je ideální pro streamování obsahu. Problém nastává ve chvíli, kdy chcete text formátovat (např. Markdown `**tučný**`). `UpdateTextStyleRequest` vyžaduje **Range** (startIndex, endIndex).

**Hybridní přístup:**

1. V rámci jednoho 2MB Chunku si na straně klienta nebo serveru spočítáte relativní délky textů.
    
2. Vytvoříte jeden velký `insertText` request, který vloží celý blok textu (např. celou kapitolu).
    
3. Následně v témže `batchUpdate` poli pošlete sérii `updateTextStyle` requestů, jejichž indexy si dopočítáte relativně k počátku vkládaného bloku. V rámci jedné dávky se indexy aktualizují atomicky, takže pokud pošlete insert a následně update na indexy, které ten insert vytvořil, API to zvládne zpracovat správně, pokud jsou requesty ve správném pořadí (nebo pokud využíváte relativitu změn v rámci transakce - zde je ale dokumentace Google opatrná a doporučuje explicitní indexy).
    

**Bezpečnější varianta:** Použít lokální "Virtual Document Model" v Apps Scriptu. Proměnná `currentIndex` bude sledovat aktuální délku dokumentu.

1. Načíst délku textu Markdownu: `L`.
    
2. Vytvořit request `InsertText` na index `currentIndex`.
    
3. Pokud je v textu tučné písmo od znaku 5 do 10, vytvořit request `UpdateTextStyle` na `currentIndex + 5` až `currentIndex + 10`.
    
4. Aktualizovat `currentIndex += L`.
    

Tento přístup je robustní a umožňuje přesné mapování Markdown syntaxe na Docs formátování.
## gDoc characters limit: 
### 5.1 Limit 1.02 milionu znaků

Google Dokumenty mají limit cca **1.02 milionu znaků** v těle dokumentu. Tento limit nezahrnuje jen viditelné znaky, ale i skryté řídící znaky objektového modelu. Překročení tohoto limitu způsobí, že dokument se stane "read-only" nebo API vrátí chybu a odmítne další zápis.   

### 5.2 Strategie "Bin Packing"

Váš skript musí fungovat jako "Bin Packer" (algoritmus plnění batohu).

1. **Analýza:** Před odesláním dat (nebo během příjmu v GAS) musíte znát délku textu.
    
2. **Tracking:** Skript musí udržovat stav (State) o aktuálním dokumentu. K tomu slouží `PropertiesService` v GAS.
    
3. **Rozhodovací logika:**
    
    - _Mám otevřený Doc #1._
        
    - _Jeho aktuální délka je 900 000 znaků._
        
    - _Přichází nový payload o velikosti 200 000 znaků._
        
    - _Součet (1.1M) > Limit (1.02M)._
        
    - _Akce:_ Uzavřít Doc #1. Vytvořit Doc #2. Zapsat payload do Doc #2. Uložit ID Doc #2 do PropertiesService jako "aktuální".
        

**Implementační detail:** Doporučuji nastavit "Soft Limit" na **950 000 znaků**. Ponechání rezervy 50-70k znaků je klíčové pro bezpečné dokončení formátování, vkládání hlaviček/patiček a indexů, aniž by došlo k poškození dokumentu v hraničních situacích.

## images
**Doporučená strategie pro obrázky:** Oddělte text a obrázky.

1. Klientský skript nahradí v Markdownu všechny obrázky unikátním zástupným textem (Placeholderem), např. `{{IMG:nazev_souboru.png}}`.
    
2. Obrázky nahraje separátními requesty na Google Drive a získá jejich ID.
    
3. Text (s placeholdery) se zkompiluje do Google Docu pomocí rychlého `batchUpdate`.
    
4. Jako **finální krok** (post-processing) projde Apps Script dokument pomocí `DocumentApp`, najde placeholdery `{{IMG:...}}` a nahradí je skutečnými obrázky z Drive pomocí `replaceText` a `insertImage`. Tento proces je pomalejší, ale robustní a obchází limity API pro privátní URL.



## 7. Návrh řešení: Krok za krokem

Na základě analýzy navrhuji následující implementační plán.

### Krok 1: Klientský "Orchestrátor" (Python/Node.js)

Vytvořte lokální skript, který poběží na vašem stroji. Nepoužívejte jen curl, potřebujete logiku.

- **Flattening:** Skript projde rekurzivně složky vaultu a vytvoří plochý seznam souborů.
    
- **Preprocessing:** Převede Markdown na zjednodušený formát (nebo rovnou JSON strukturu `requests`), vyřeší wikilinks `[[odkaz]]` (převede na text nebo hyperlink, pokud zná cíl).
    
- **Chunking:** Začne načítat text do bufferu. Jakmile buffer přesáhne **2 MB**, uzavře dávku (Chunk).
    
- **Odeslání:** Odešle JSON POST request na vaši Web App.
    

### Krok 2: Serverová Web App (Google Apps Script)

### Krok 3: Rate Limiting a Backoff Strategie

Váš klientský skript musí být připraven na chyby `429` a `500`. Implementujte **Exponenciální Backoff**:

1. Odeslat Request.
    
2. Pokud OK (200) -> Pokračovat.
    
3. Pokud Chyba (429/500/502) -> Čekat **2 sekundy**. Zkusit znovu.
    
4. Pokud stále Chyba -> Čekat **4 sekundy**. Zkusit znovu.
    
5. ... **8 sekund**, **16 sekund**.
    
6. Po 5 pokusech (cca 32 sekund pauza) prohlásit dávku za neúspěšnou a logovat chybu.
    

Tato strategie je nezbytná pro překonání dočasných výpadků a "throttle" mechanismů Google API.