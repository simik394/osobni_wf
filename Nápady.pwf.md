
> [!NOTE] Sunday, October 26, 2025 2:44:21 PM CET
> MAKE Obsidian plugin (tedavlastně cokoliv co by mi do vaultu importovalo automaticky nebo aspoň indexovalo (md zástupnýma souborama) npř. NotebookLM sešity, vybrane gDocs,..... hmmmmm vlastně na tohle už jsem si i udělal poznámku (na vypsání zdrojů ze kterých mám data) je v keepu. takže bych ji sem v ideálním světě už mohl linknout, nicméně co třeba ten keep přestat používat, když muˇy mám alternativy minimálně na quckCapture čehokoliv. TEda aspoň těžce omezit A TEDA POTŘEBOVAL BY UKLIDIT. TEN KEEP!!!
> 
> Když už si tady píšu takhle věci zdá se že i úkoly by opravdu bylo dobrý (možná i přínosný) psát rovnou takhle v textu když na to přijde řeč.
> ->> tzn. mít (Pro sebe, ne pracovně) nějaký automatizace, který by načitaly z mźch textových souborů napříč vaultem nějakkým způsobem zapsané tasky/issues (ideálně  i doplňovala v případě nedostatečně granulárního rezepsání). a ty načtené úkoly pak zrcadlila na youtrack server. V optimálním případě by samozřejmě fungovala obousměrně, (abych mohl hodnoty jednotlivých parametrů na každém úkolu přepisovat/aktualizovat z jednoho (textové soubory editor) tak i druhého (youtrack). přičemž bych nemusel žádnou synchronizační logiku pro spolehlivé fungování nemusel implementovat já ani žádný z ai agentů. tzn. najít knihovnu na

2025-08-16
---

Nechci, z hlediska využívání mobilního Obsidianu mít spíše vault/projekt? To připojení všech by se přinejhorším dalo vyřešit oběma variantama zároveň, nebo externíma odkazama pluginem. 
A neumí vlastně obsi dělat odkazy mezi načtenejma vaultama? Kdyby jo, neměl bych už asi důvod používat *jeden společný vault pro všechno?*
03:18

Chtělo by to nějaké **browser automatizace**, které by mi automaticky ukládaly zadané prompty a vyhledávání jako stránky do Obsi.
19:54

**Journal notifikační flow** [tags::tt/Upravit] tak aby pořád ukazovalo notifikaci, kterou když odkliknu Ano, vynuluje se časomíra do brutálního připomenutí.
Odklikávat přitom můžu jenom když je v daily poznámce nový záznam. ^journalNotifImprove01

# reMsidian
Jeden reM sešit rovná se jeden nadpisama podle stránek rozdělenej md soubor
*To bych pomocí headingů v jednom souboru mohl udělat celou škodovky strukturu skoro.*

---
Stejně jednotlivý importovaný stránky budou jako obrázky (nebo PDF?).
Takže to spíš bude "jeden sešit = jedna složka"

Jak handlovat když se Stránka na reM upraví? Přepsat stávající?
Co takhle verzovat? Hmm jakože vytvářet nové soubory.

Takže bych tak mohl mít

## Chtěl bych aby:
mi to automaticky u každý poznámky trackovalo, kdy byla vytvořena (a editovaná nebo to budou nový soubory?)
V obsidianu drželo asap po uložení na reM

# MIXík

- [ ] Uklidit prohlížeče
	- [ ] Udělat web clipper šablony
		- [x] Udělat Websites šablonu
		- [ ] udělat Obsi šablonu
		- [ ] udělat nvim šablonu

- [ ] Uklidit so fotky
	- [ ] vytřídit nechtěné, rozmazané
	- [x] Hostnout immich

- [ ] Uklidot si Obsi
	- [ ] Zrušit samostatnou složku na research | vytvořit research složku v každém projektu zvlášť | roztřídit aktuální research pod jednotlivé projekty. *Nebo možná ne?*

- [ ] Rozšířit využívanou funkcionalitu obsi
	- [ ] rvidovat daily note template
	- [ ] začít používat daily notes. Opět
	- [ ] zapisovat otázky
		- [ ] clippvat rovnou odpovědi na otázky
	- [ ] zaznamenávat daily spotřebu substancí
	- [ ] začít znovu používat .vimrc plugin
		- [ ] zrevidovat a sjednotit .vimrc mezi jednotlivými obsidiany (i nvimy)
	- [ ] doplnění class definic
		- [ ] doplnění ikon pro specifické classy
		- [ ] **Rozhodnout se** zda používat na poznámkách fstype pole, nebo identifikovat classu podle umístění na disku, alternativně by bylomožné mít research rozdělený mezi jednotlivé *projektové oblasti*
	- [ ] rozchodit quickadd
		- [ ] nechci využívat nějaký alternativní způsob? 
			- [ ] jaké jsou alternativní způsoby
	- [ ] začít používat breadcrumbs 
		- [ ] naučit se s breadcrumbs pluginem
	- [ ] Nastavit linter plugin tak aby mi hezky formátoval poznámky
	- [ ] Nastavit webhooks z/do Obsi
	- [ ] **DO** nastavit všem šablonám aby uváděly i datum (čas?) vytvoření daně poznámky

 

- [[přejít na web clipper]]
	- [ ] templates z obsidian webu
	- [ ] dovytvořit nové templates ve web clipperu
		- [ ] sw - features
		- [ ] sw - compatibilities
		- [ ] sw- dependencies
		- [ ] sw - synergies

- [ ] Rozšířit me dostupné schopnosti AI
	- [ ] Nastavit anythingllm na always restart
	- [ ] Vyzkoušet gSheet mcp
	- [ ] **Vybrat** obsidian mcp
		- [ ] **Najít** obsidian MCP s možností volat obsi commands 
		- [ ] **porovnat** dostupné obsi mcp servery
		- [ ] ****Vyzkoušet**** dostupné/vybrané obsi mcp servery
		- [ ] Rozjet obsidian-docker
			- [x] ****Vyzkoušet**** ten server z lobehubu který by měl jako jediný umět volat obcommandy přes local rest api obsi plugin. 🚀 2025-08-13 ✅ 2025-08-13
	- [ ] **vybrat** llm mcp supporting inference interface
		- [ ] deploynout lobehub
	- [ ] nastavit obsidian tak aby automaticky vyhodnocoval například podobnosti, či kompatibilitu různých položek inventáře
- [ ] vylepšit implementovanou infrastrukturu
	- [ ] **Vyzkoušet** konečně nomáda na halvarm
	- [ ] deploynout n8n
___
from: 2025-08-04 on: 2025-10-01 11:10:64