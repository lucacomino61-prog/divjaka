# Udhëzuesi i pronarit · Hotel Pelikan

*English version below: [Owner's guide](#owners-guide--hotel-pelikan).*

Ky udhëzues është për stafin e Hotel Pelikan që punon me platformën **Divjaka Smart Tourism Platform**: sajtin publik (shqip në `/`, anglisht në `/en/`) dhe panelin e administrimit në `/admin/`. Punët që i bën vetëm personi që mirëmban serverin janë shënuar **[Zhvilluesi]**.

Lista e plotë e vlerave që duhen konfirmuar para hapjes është te `NEEDS_VERIFICATION.md`.

---

## 1. Hyrja në administrim

- Hapni `https://<domeni-juaj>/admin/`. Gjatë provave në kompjuterin e zhvilluesit adresa është `http://127.0.0.1:3800/admin/`.
- Email-in dhe fjalëkalimin e parë jua jep zhvilluesi. Ato ruhen në skedarin `.env` të serverit (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) dhe nuk dalin kurrë në sajt.
- Pas hyrjes së parë: **Cilësimet → Fjalëkalimi juaj** → vendosni një fjalëkalim të ri me të paktën 12 shenja. Pastaj kërkojini zhvilluesit të fshijë `ADMIN_PASSWORD` nga `.env`.
- Paneli hapet në shqip. Butoni **English** lart e kalon në anglisht.
- Seanca zgjat 14 ditë nga përdorimi i fundit (30 ditë më së shumti). Pastaj hyni përsëri.
- Shfletuesi ku keni hyrë një herë mbahet mend 180 ditë. Edhe kur dikush provon fjalëkalime të gabuara mbi llogarinë tuaj, nga ky shfletues hyni pa u bllokuar.
- Keni harruar fjalëkalimin? **[Zhvilluesi]** vendos një `ADMIN_PASSWORD` të ri në `.env` dhe nis `node scripts/seed.mjs --sync-admin`. Kjo mbyll çdo seancë të hapur.
- **Rolet.** *Pronari* bën gjithçka. *Stafi* punon me porositë, rezervimet, oraret, mesazhet, FAQ-në dhe tekstet e produkteve, por nuk ndryshon çmimet, publikimin, ofertat dhe cilësimet, as nuk shkarkon apo fshin klientë. Produktet që krijon stafi ruhen si skicë. Llogaritë e stafit i krijon **[Zhvilluesi]**: paneli nuk ka ende një ekran për to.

## 2. Puna e përditshme

**Sajti nuk dërgon email dhe nuk ju njofton vetë.** Hapni panelin disa herë në ditë. Menuja tregon „{n} në pritje“ pranë **Porositë** dhe „{n} të palexuara“ pranë **Mesazhet**. Në **Paneli**, kutia **Kërkon vëmendje** liston çdo problem të serverit ose të cilësimeve, me lidhjen ku zgjidhet.

### 2.1 Porositë

Statuset: **Në pritje**, **Konfirmuar**, **Përfunduar**, **Anuluar**. Pagesa: **Pa paguar**, **Paguar**, **Rimbursuar**, **Dështoi**.

**Rregulli kryesor:** një porosi që askush s’e ka konfirmuar dhe s’është paguar i mban dhomat, vendet ose stokun vetëm për pak kohë, pastaj lirohet vetë:

| Mënyra e pagesës | Mbahet |
|---|---|
| Kartë | 30 minuta |
| Transfertë bankare | 72 orë |
| Pagesë në hotel | 24 orë |
| Mbajtje e shkurtër | 2 orë: qëndrime mbi 7 netë, mbërritje më shumë se 60 ditë përpara, ose porosi që duken të dyshimta. Lista tregon arsyen te „Mbajtje e shkurtër: …“. |

Lista tregon „Mbahet deri {ora}“. Sapo e konfirmoni porosinë, ajo nuk lirohet më vetë. Afatet ndryshohen te **Cilësimet → Pagesat** dhe **Inventari dhe rezervimet**.

**Për çdo porosi të re:**
1. Hapeni te **Porositë** (kodi `DV-…`).
2. Telefononi ose shkruajini klientit. Telefoni është i detyrueshëm për pagesë në hotel dhe për transfertë. Klienti nuk merr email: porosinë e sheh në faqen e saj, ose e gjen te **Rezervimet e mia** (`/rezervimet/`) me kodin dhe email-in.
3. Porosi e vërtetë: **Konfirmo porosinë**. Porosi e rreme ose e pamundur: **Anulo porosinë**.

**Pagesë në hotel.** Konfirmojeni brenda 24 orëve, ose para afatit më të shkurtër që shihet te porosia. Kur klienti paguan në recepsion: **Shëno si të paguar**. Pas qëndrimit ose turit: **Shëno si të përfunduar**.

**Transfertë bankare.** Klienti sheh IBAN-in në faqen e porosisë. Kur paratë mbërrijnë në llogari: shkruani numrin e transfertës te **Referenca e pagesës**, shtypni **Ruaj shënimet**, pastaj **Shëno si të paguar** dhe **Konfirmo porosinë**. Nëse paratë nuk vijnë brenda 72 orëve, porosia lirohet vetë. Sajti nuk e ofron transfertën për një qëndrim ose tur që nis brenda 72 orëve.

**Kartë** (vetëm pasi të keni kontratë me POK, shih §5). Porosia paguhet dhe konfirmohet vetë kur POK konfirmon pagesën („Konfirmuar me pagesën“). Nëse klienti nuk paguan brenda 30 minutave, porosia lirohet.

**Anulimi.** **Anulo porosinë** i liron menjëherë dhomat, vendet dhe stokun. Klienti nuk njoftohet: telefonojini. Nëse ka paguar, kthejini paratë nga banka ose nga ofruesi i kartës (sajti nuk kthen para vetë), pastaj **Shëno si të rimbursuar**. **Rihap porosinë** i merr përsëri dhomat dhe vendet, vetëm nëse janë ende të lira.

**Orar i anuluar.** Kur stafi anulon një orar eksperience, porositë në të tregojnë „Orari u anulua“. Njoftoni klientin, pastaj anuloni porosinë ose rihapeni orarin.

**Shumë porosi të rreme njëherësh.** Nëse Paneli shkruan „Në orën e fundit erdhën shumë porosi pa pagesë…“: **Porositë → Anulo porositë e pakonfirmuara** → zgjidhni periudhën dhe mënyrat e pagesës → **Shiko cilat janë** → kontrolloni listën → **Anulo {n} porositë**. Konfirmoni më parë porositë e vërteta: ato nuk preken.

**Pëlqimi për marketing.** Kutia që klienti shënon në arkë vlen vetëm pasi ai paguan, ose pasi ta pyesni dhe të shtypni **Konfirmo pëlqimin për marketing**.

**Printo** jep fletën e porosisë për recepsionin.

### 2.2 Rezervimet

Rrjeta e netëve tregon për çdo lloj dhome sa njësi janë të zëna, të mbyllura dhe të lira, natë pas nate. Klikoni një natë për ta mbyllur ose hapur. Më poshtë: qëndrimet e periudhës dhe oraret e eksperiencave me listën e pjesëmarrësve.

### 2.3 Eksperiencat & oraret

- Oraret e para u krijuan automatikisht për 90 ditë përpara. **Krijoni orare të reja me kohë**, për shembull një herë në muaj, që sajti të ketë gjithmonë data për të shitur.
- **Krijo orare nga një model javor:** zgjidhni eksperiencën, ditët e javës, orët e nisjes, vendet për orar dhe periudhën → **Krijo oraret**. Oraret që ekzistojnë nuk preken.
- **Shto një orar të vetëm** për një datë të veçantë.
- **Mbyll** ndalon rezervimet e reja dhe i mban ato që ekzistojnë.
- **Anulo orarin** NUK i anulon rezervimet e bëra: anuloni vetë ato porosi dhe njoftoni klientët. Fshihet vetëm një orar pa rezervime.
- Disa orare ndjekin lindjen ose perëndimin e diellit („Ndjek lindjen e diellit“). Gjeneratori javor përdor orë fikse: kontrollojini sipas stinës.
- Shitja e një orari mbyllet 2 orë para nisjes (**Cilësimet → Inventari dhe rezervimet**).

### 2.4 Mbyllja e netëve

- **Dhomat & çmimet → Mbyll ose hap netë:** lloji i dhomës, nata e parë, nata e fundit (të dyja përfshihen), sa dhoma (ose **Të gjitha**) → **Zbato**. Me 0 i hapni sërish.
- Ose te **Rezervimet**: klikoni natën në rrjetë.
- Dhomat e rezervuara nuk mbyllen kurrë: mbyllen vetëm ato të lira.
- Për të ulur përgjithmonë numrin e dhomave të një lloji, ndryshoni **Dhoma të këtij lloji**. Nëse disa netë kanë më shumë rezervime, ndryshimi refuzohet: mbyllni ato netë një nga një.

### 2.5 Çmimet dhe çmimet sezonale (pronari)

- **Dhomat & çmimet:** ndryshoni **Çmimi bazë për natë** → **Ruaj dhomat dhe çmimin**.
- **Shto një çmim sezonal:** nata e parë, nata e fundit (të dyja përfshihen), çmimi për natë, shënim. Kur dy periudha mbivendosen, vlen ajo e shtuar më vonë. Kur e fshini, netët kthehen te çmimi bazë. Shiriti **Netët e ardhshme** tregon çmimin e çdo nate.
- Eksperiencat, paketat, karta dhuratë dhe mallrat: **Produktet** → produkti → **Çmimi dhe sasia**. **Çmimi i vjetër (i vizatuar)** shfaq një zbritje të dorës.
- Çmimet ruhen në lekë. Sajti tregon edhe euro si përafërsi, me kursin te **Cilësimet → Kursi i euros**. Përditësojeni rregullisht nga Banka e Shqipërisë.

### 2.6 Ofertat dhe kodet promocionale (pronari)

- **Ofertë automatike** (pa kod): ul çmimet vetë kur plotësohen kushtet dhe tregon çmimin e vjetër të vizatuar.
- **Kod promocional:** klienti e shkruan në arkë. Të paktën 8 shkronja ose shifra.
- Fushat: lloji (përqindje ose shumë fikse), vlera, për çfarë vlen (lloje, kategori, produkte), netë minimale, shuma minimale, data e fillimit dhe e mbarimit, përdorime maksimale, aktive ose jo.
- Kur ruani një ofertë, shenja DEMO hiqet.
- Kodi demo `MIRESEVINI10` shihet në kodin publik të projektit: ndryshojeni kodin para se ta aktivizoni.

### 2.7 Mesazhet

- Vijnë nga **Formulari i kontaktit**, nga **Asistenti** (kur klienti kërkon një njeri) dhe si **Kërkesë për telefonatë**.
- **Përgjigju me email** hap programin tuaj të email-it; **Telefono** thërret numrin. Kur mbaroni, **Shëno si të trajtuar**.
- Fusha **Email-i për pyetjet që i kalojnë stafit** (Cilësimet → Asistenti) ruhet, por sot sajti nuk dërgon asnjë email: çdo kërkesë mbërrin vetëm këtu.

### 2.8 Asistenti dhe FAQ

- Asistenti përgjigjet nga pyetjet e shpeshta (FAQ), nga disponueshmëria e çastit dhe nga moti. Kur nuk e di përgjigjen, i ofron klientit të lërë kontaktin për stafin (mesazh te **Mesazhet**).
- **Provo asistentin:** pyesni si një vizitor. Këto pyetje nuk numërohen në analitikë.
- **Pyetje pa përgjigje (30 ditët e fundit)** → **Krijo FAQ nga kjo**.
- Shkruani faktet ashtu siç janë: asistenti nuk duhet të premtojë gjëra që hoteli nuk i ofron.
- **Fjalë kyçe:** të ndara me presje, në të dyja gjuhët, me dhe pa ë/ç (p.sh. `pelikan, pelikanë, pelican`).
- Shenjat `{card_min}`, `{bank_h}`, `{hotel_h}`, `{short_h}` në një përgjigje zëvendësohen me afatet aktuale nga Cilësimet. Mos i shkruani shifrat me dorë.
- **Kur konfirmoni orët e check-in/check-out, ndryshojini në dy vende:** **Cilësimet → Hoteli** dhe FAQ-ja „Në çfarë ore është check-in dhe check-out?“. Njësoj për FAQ-në „Në cilat gjuhë flitet?“.
- Rishkruajini këto FAQ sapo ta dini përgjigjen: „A është hoteli i hapur gjithë vitin?“, „Çfarë ndodh me një eksperiencë nëse moti është i keq?“, „A janë çmimet në lekë apo në euro?“ (si paguan klienti në recepsion), „Sa kushton hyrja në park?“.
- **Modeli gjuhësor (opsional):** kur serveri ka `ANTHROPIC_API_KEY` dhe **Përdor modelin gjuhësor kur FAQ nuk mjafton** është aktiv, asistenti mund të formulojë përgjigje me Claude (Anthropic), deri në **Thirrje të modelit në ditë** (300). Faqja e privatësisë e përmend atëherë vetë Anthropic. Pa çelës, asistenti përgjigjet vetëm nga FAQ.

### 2.9 Klientët

- Lista, historiku i porosive dhe shënimet e brendshme për çdo klient.
- **Lista e marketingut (CSV)** përmban vetëm pëlqime të konfirmuara. Vetëm pronari e shkarkon, dhe çdo shkarkim regjistrohet.
- **Fshi të dhënat e klientit** (vetëm pronari) për kërkesat „më fshini“. Nuk kthehet pas: porositë mbajnë shumat dhe datat, por humbasin emrin, email-in dhe telefonin.
- Para se t’u dërgoni klientëve oferta me email, duhet një mënyrë që ata të çregjistrohen.

### 2.10 Produktet

- **Tekstet**, shqip dhe anglisht: emri, përmbledhja, përshkrimi (tekst i thjeshtë; një rresht bosh = paragraf i ri), çfarë përfshihet dhe çfarë jo.
- **Fotot:** **Zgjidh nga biblioteka** (foto me licencë, të kredituara te faqja Burimet) ose **Ngarko foto** (të paktën 480 px e gjerë; edhe nga iPhone). Çdo foto ka nevojë për një përshkrim shqip dhe anglisht të asaj që shihet realisht në të.
- **Vendi në hartë**, **Interesat**, **Muajt kur ofrohet** (asnjë muaj = gjithë vitin).
- **Publikimi** (pronari): Skicë, Publikuar, Arkivuar.
- Mos e ndryshoni **Adresa (slug)**: lidhjet e vjetra prishen.
- Pika e takimit, shtretërit, sipërfaqja e dhomës dhe burimet nuk ndryshohen nga paneli: **[Zhvilluesi]**.

### 2.11 Cilësimet (pronari)

**Hoteli** · **Vlerësime të verifikuara** · **Pagesat** (kërkon fjalëkalimin edhe një herë) · **Kursi i euros** · **Rrjetet sociale** · **SEO dhe adresa e sajtit** (edhe katalogu XML për Google Merchant Center) · **Inventari dhe rezervimet** · **Privatësia dhe ruajtja e të dhënave** · **Asistenti** · **Rezervimi direkt** · **Ndërtuesi i lidhjeve UTM** · **Fjalëkalimi juaj** · **Serveri** (vetëm për lexim).

Te **Hoteli**, një fushë me shenjën **E pakonfirmuar** nuk shfaqet në sajt. Shkruani vlerën e saktë, ose, nëse vlera që shihni është e saktë, shënoni **Është e saktë: shfaqe në sajt**; pastaj **Ruaj**.

**Rezervimi direkt:** shënojeni vetëm pasi të keni kontrolluar që çmimet tuaja nuk janë më të larta se në Booking.com apo faqe të tjera.

## 3. Shenjat DEMO dhe TEST

Sajti u ndërtua me vlera prove që të punonte nga fillimi në fund. Shenjat tregojnë ku janë ato. Kur hiqni një shenjë, nuk ndryshon asnjë vlerë: thoni që vlera është e vërtetë. Prandaj kontrollojini vlerat më parë.

| Shenja | Ku | Çfarë do të thotë | Si hiqet |
|---|---|---|---|
| **DEMO** te një produkt | Produktet, Dhomat & çmimet | Çmimi, numri i dhomave, vendet, stoku ose oraret janë vendosur për provë. | Pronari: kontrolloni vlerat → te **Çmimi dhe sasia** shënoni **Vlerat janë të vërteta…** (dhomat: te Dhomat & çmimet) → **Ruaj**. Vetëm atëherë sajti tregon numrin e dhomave, vendeve dhe stokut të lirë. Rreshti „N dhoma të lira sonte“ del vetëm kur çdo lloj dhome i publikuar është konfirmuar. |
| **DEMO** te një ofertë | Ofertat | Oferta ose kodi u vendos për provë. | Pronari: hapeni, kontrollojeni → **Ruaj**. |
| „DEMO: sezoni i lartë“ | Çmimet sezonale | Çmimi i verës është i shpikur. | Ndryshoni çmimin dhe shënimin, ose fshijeni periudhën. |
| **E pakonfirmuar** | Cilësimet → Hoteli, SEO | Vlerë nga listimet publike, e fshehur në sajt. | Shkruani vlerën e saktë ose shënoni **Është e saktë: shfaqe në sajt** → **Ruaj**. |
| „Porosi demo“ dhe DEMO në Panel/Analitikë („Këto shifra përfshijnë të dhëna demo…“) | Porositë, Klientët, Paneli, Analitika | Rreth 60 porosi dhe klientë të shpikur (`@example.com`) dhe vizita prove. Nuk janë shitje të vërteta. | Nuk hiqen nga paneli. **[Zhvilluesi]** e hap sajtin publik me një bazë të dhënash të re pa të dhëna demo (§4). |
| **TEST** / „Provë · do të lirohet {ora}“ | Porositë | Porosi e „paguar“ me simulatorin e kartës. Nuk janë para të vërteta dhe nuk numërohen kurrë. | Asgjë: lirohet vetë. Ose anulojeni. |
| **Skicë** | Produktet | Nuk shfaqet në sajt (sot: „Dhomë dyshe“). | Publikojeni vetëm kur të keni konfirmuar që lloji ekziston dhe çmimin. |

## 4. Para hapjes

Lista e plotë, me vendin ku ndryshohet çdo vlerë: `NEEDS_VERIFICATION.md`. Shkurt:

- **Pronari, në panel:** të dhënat e hotelit (emri ligjor, NIPT, telefoni, email-i, orët), dhomat dhe çmimet, eksperiencat dhe oraret, dyqani, ofertat, IBAN-i, kursi i euros, adresa publike e sajtit, rrjetet sociale, vlerësimi i Booking.com, FAQ-të e hapura, fotot e dhomave dhe të restorantit.
- **Pronari me një jurist:** faqet e privatësisë dhe të kushteve (sot janë drafte), politika e anulimit dhe e depozitës, rregulli për cookies.
- **[Zhvilluesi]:** baza e të dhënave e re pa demo (`npm run db:seed`, pa `--demo`), serveri dhe proxy-ja, `LIVE_CONTACT`, kopjet rezervë, heqja e llogarive provë, `ALLOW_TEST_PAYMENTS` i fikur, licenca e kodit, tekstet që jetojnë në kod.

## 5. Pagesat

**Sot:**
- **Pagesë në hotel:** aktive.
- **Transfertë bankare:** e fikur derisa të vendosen IBAN-i dhe përfituesi (**Cilësimet → Pagesat**, me fjalëkalimin tuaj edhe një herë). Pas çdo ndryshimi të llogarisë, Paneli e tregon për 7 ditë: sigurohuni që e bëtë ju.
- **Kartë:** në modalitetin **TEST**. Simulatori TEST punon vetëm në serverin e zhvillimit ose me `ALLOW_TEST_PAYMENTS=1`. Në sajtin publik karta nuk ofrohet fare derisa të ketë një kontratë të vërtetë. Mos e lini kurrë `ALLOW_TEST_PAYMENTS=1` në sajtin publik: një klient do të mund ta shënonte vetë porosinë si të paguar.

**Me një kontratë POK:**
1. Hoteli nënshkruan me POK dhe merr çelësat.
2. **[Zhvilluesi]** i vendos në server: `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID`, `POK_ENV=production` (`staging` për prova), pastaj e rinis serverin.
3. Pronari: **Cilësimet → SEO dhe adresa e sajtit** → adresa publike `https://…`. Pa të, karta mbetet e fikur.
4. Pronari: **Cilësimet → Pagesat → Pagesat me kartë** → **LIVE — POK**, me fjalëkalimin.
5. Bëni një pagesë të vogël të vërtetë dhe kontrolloni që porosia bëhet „Paguar“ vetë. Pastaj kthejeni.

Serveri e shënon një porosi të paguar vetëm pasi e lexon pagesën drejtpërdrejt nga POK. Kthimin e parave e bëni te POK, pastaj **Shëno si të rimbursuar**.

**Me BKT Virtual POS:** platforma nuk ka ende lidhje me BKT. **[Zhvilluesi]** duhet ta ndërtojë (si atë me POK) para se të funksionojë. Sipas faqes së BKT: 170 € një herë dhe 110 € në vit; tarifa për transaksion nuk publikohet. Banka kërkon NIPT-in, ekstraktin e QKB-së, statutin dhe formularët e saj, dhe sajti duhet të tregojë të dhënat e shoqërisë, privatësinë, kushtet dhe politikën e anulimit.

**Variablat e serverit për pagesat** (në `.env`, i vendos **[Zhvilluesi]**):

| Variabli | Për çfarë |
|---|---|
| `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID` | Çelësat e POK. Pa to karta nuk punon në LIVE. |
| `POK_ENV` | `production` ose `staging`. |
| `ALLOW_TEST_PAYMENTS` | `1` vetëm në serverë prove. Kurrë në sajtin publik. |

## 6. Moti dhe të dhënat e çastit

- Faqja **Tani** (`/tani/`), shiriti lart dhe ballina marrin motin nga **MET Norway** (falas edhe për biznese, licenca CC BY 4.0). MET kërkon një email kontakti: vendosni `LIVE_CONTACT` në server **[Zhvilluesi]** ose konfirmoni email-in e hotelit te **Cilësimet → Hoteli**. Deri atëherë Paneli tregon një paralajmërim.
- Temperatura e detit vjen nga analiza satelitore NASA JPL MUR, rreth një ditë me vonesë, dhe tregohet me datën e saj.
- Lindja dhe perëndimi i diellit llogariten nga vetë serveri.
- **Opsionale:** cilësia e ajrit, valët dhe UV-ja e vërtetë kërkojnë planin **API Standard** të Open-Meteo (29 € në muaj, lexuar më 23.10.2026; TVSH-ja nuk u kontrollua). Me çelësin te `OPEN_METEO_API_KEY` dhe një rinisje, shfaqen vetë; pa të mbeten të fshehura. Versioni falas i Open-Meteo lejohet vetëm për përdorim jotregtar, ndaj nuk përdoret.
- Kur një burim nuk përgjigjet, sajti tregon „po ngarkohet“ dhe pastaj gjendjen pa leximet. Nuk keni pse të bëni gjë.

## 7. Kopjet rezervë

**Çfarë ruhet:**
- `data/divjaka.db`: gjithçka (porositë, klientët, produktet, cilësimet, analitika);
- `data/uploads/`: fotot e ngarkuara;
- `.env`: fjalëkalimet dhe çelësat. Ruajeni veçmas dhe në vend të sigurt.

**Si** (**[Zhvilluesi]**, çdo ditë, me serverin në punë, nga dosja e projektit):

```sh
node -e "const {DatabaseSync}=require('node:sqlite');const out=process.argv[1]+'/divjaka-'+new Date().toISOString().slice(0,10)+'.db';new DatabaseSync('data/divjaka.db',{readOnly:true}).exec(\"VACUUM INTO '\"+out+\"'\");console.log('saved',out)" /rruga/e/kopjeve
```

- Mos e kopjoni vetëm skedarin `divjaka.db` ndërsa serveri punon: pjesa e fundit e të dhënave është te `divjaka.db-wal`. Komanda e mësipërme jep një kopje të plotë.
- Kopjoni edhe `data/uploads/`. Mbani kopjet ditore për 30 ditë dhe një kopje në muaj, jashtë serverit dhe të enkriptuara. Baza ka emra, email-e, telefona dhe lidhjet e porosive të klientëve: mos e vendosni kurrë në Git ose në një vend publik.
- **Rikthimi:** ndaleni serverin → zëvendësoni `data/divjaka.db` me kopjen → fshini `divjaka.db-wal` dhe `divjaka.db-shm` → nisni serverin. Provojeni një herë para hapjes.
- Mos nisni kurrë `npm run db:demo` mbi bazën e vërtetë: ajo i fshin të gjitha (dhe refuzon kur baza duket e vërtetë).

## 8. Analitika

- **Paneli:** të ardhurat (porosi të paguara ose të konfirmuara), porositë, vlera mesatare, klientët që kthehen, zënia e dhomave për 30 netët e ardhshme, rruga drejt blerjes, porositë e fundit, stoku i ulët, oraret pothuajse plot, pyetjet pa përgjigje te asistenti. Periudhën e zgjidhni lart.
- **Analitika:** nga erdhën vizitorët (UTM, faqja referuese, drejtpërdrejt), fushatat, porositë sipas burimit, pajisjet, gjuhët, faqet dhe produktet më të shikuara, kërkimet në sajt (me të kuqe: kërkime pa rezultat), pyetjet që asistenti nuk i kuptoi, shpejtësia reale e sajtit (Web Vitals).
- Të dhënat ruhen në bazën e hotelit, në serverin tuaj. Pa cookies, pa adresa IP dhe pa Google Analytics apo shërbime të tjera të jashtme: çdo skedë shfletuesi numërohet si një vizitor. Ngjarjet e detajuara mbahen 180 ditë, pastaj mbeten vetëm totalet ditore.
- Porositë TEST nuk numërohen kurrë. Të dhënat demo shënohen me DEMO.
- **Ndërtuesi i lidhjeve UTM** (Cilësimet) jep lidhje për postime dhe reklama, që Analitika të tregojë nga erdhën vizitorët.

---

# Owner's guide · Hotel Pelikan

This guide is for the Hotel Pelikan staff who run the **Divjaka Smart Tourism Platform**: the public site (Albanian at `/`, English under `/en/`) and the admin panel at `/admin/`. Jobs only the person who looks after the server can do are marked **[Developer]**.

The full list of values to confirm before launch is in `NEEDS_VERIFICATION.md`.

## 1. Signing in

- Open `https://<your-domain>/admin/`. While testing on the developer's computer the address is `http://127.0.0.1:3800/admin/`.
- The developer gives you the e-mail and the first password. They live in the server's `.env` file (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) and never appear on the site.
- After your first sign-in: **Cilësimet → Fjalëkalimi juaj** (Settings → Your password) → set a new password of at least 12 characters. Then ask the developer to delete `ADMIN_PASSWORD` from `.env`.
- The panel opens in Albanian. The **English** button at the top switches it. Labels below are given in Albanian first, as you see them by default.
- A session lasts 14 days from your last use (30 days at most). Then sign in again.
- A browser you have signed in from is remembered for 180 days. Even while someone tries wrong passwords on your account, you get in from that browser.
- Forgot the password? **[Developer]** puts a new `ADMIN_PASSWORD` in `.env` and runs `node scripts/seed.mjs --sync-admin`. This ends every open session.
- **Roles.** The *owner* can do everything. *Staff* handle orders, bookings, schedules, messages, the FAQ and product texts, but cannot change prices, publishing, offers or settings, or export and erase customers. Products created by staff are saved as drafts. Staff accounts are created by the **[Developer]**: the panel has no screen for them yet.

## 2. Daily tasks

**The site sends no e-mail and does not alert you.** Open the panel several times a day. The menu shows "{n} waiting" next to **Porositë** (Orders) and "{n} unread" next to **Mesazhet** (Messages). On **Paneli** (Dashboard), the **Kërkon vëmendje** (Needs attention) box lists every server or settings problem with a link to where you fix it.

### 2.1 Orders (Porositë)

Status: **Në pritje** (pending), **Konfirmuar** (confirmed), **Përfunduar** (completed), **Anuluar** (cancelled). Payment: **Pa paguar** (unpaid), **Paguar** (paid), **Rimbursuar** (refunded), **Dështoi** (failed).

**The main rule:** an order nobody has confirmed or paid holds its rooms, places or stock only for a while, then is released automatically:

| Payment method | Held for |
|---|---|
| Card | 30 minutes |
| Bank transfer | 72 hours |
| Pay at the hotel | 24 hours |
| Short hold | 2 hours: stays over 7 nights, arrivals more than 60 days ahead, or orders that look suspicious. The list gives the reason after "Mbajtje e shkurtër: …". |

The list shows "Mbahet deri {time}" (held until). Once you confirm an order it is never released automatically. The times are changed under **Cilësimet → Pagesat** and **Inventari dhe rezervimet**.

**For every new order:**
1. Open it under **Porositë** (code `DV-…`).
2. Call or write to the guest. A phone number is required for pay-at-hotel and bank transfer. The guest gets no e-mail: they see the order on its own page, or find it under **Rezervimet e mia** (My bookings, `/en/bookings/`) with the code and their e-mail.
3. A real order: **Konfirmo porosinë** (Confirm). A fake or impossible one: **Anulo porosinë** (Cancel).

**Pay at the hotel.** Confirm within 24 hours, or before the shorter deadline the order shows. When the guest pays at reception: **Shëno si të paguar** (Mark as paid). After the stay or tour: **Shëno si të përfunduar** (Mark as completed).

**Bank transfer.** The guest sees the IBAN on the order page. When the money reaches the account: type the transfer number into **Referenca e pagesës** (Payment reference), press **Ruaj shënimet** (Save notes), then **Shëno si të paguar** and **Konfirmo porosinë**. If the money does not arrive within 72 hours the order is released. The site does not offer bank transfer for a stay or tour that starts within 72 hours.

**Card** (only once you have a POK contract, see §5). The order is paid and confirmed by itself when POK confirms the payment. If the guest does not pay within 30 minutes, the order is released.

**Cancelling.** **Anulo porosinë** releases the rooms, places and stock at once. The guest is not told: call them. If they paid, refund them through the bank or the card provider (the site does not move money), then **Shëno si të rimbursuar** (Mark as refunded). **Rihap porosinë** (Reopen) takes the rooms and places back, only if they are still free.

**Cancelled time slot.** When staff cancel an experience slot, its orders show "Orari u anulua" (slot cancelled). Tell the guest, then cancel the order or reopen the slot.

**Many fake orders at once.** If the dashboard says many unpaid orders arrived in the last hour: **Porositë → Anulo porositë e pakonfirmuara** (Cancel unconfirmed orders) → choose the period and payment methods → **Shiko cilat janë** (See which ones) → check the list → **Anulo {n} porositë**. Confirm the real orders first: confirmed orders are never touched.

**Marketing consent.** The box a guest ticks at checkout counts only after they pay, or after you ask them and press **Konfirmo pëlqimin për marketing**.

**Printo** (Print) gives the order sheet for reception.

### 2.2 Bookings (Rezervimet)

The night grid shows, for each room type, how many units are booked, closed and free, night by night. Click a night to close or open it. Below: the stays in the period and the experience slots with their guest lists.

### 2.3 Experiences and schedules (Eksperiencat & oraret)

- The first slots were created automatically 90 days ahead. **Create new slots in good time**, for example once a month, so the site always has dates to sell.
- **Krijo orare nga një model javor** (weekly pattern): pick the experience, weekdays, start times, places per slot and the period → **Krijo oraret**. Existing slots are left alone.
- **Shto një orar të vetëm** adds one slot on one date.
- **Mbyll** (Close) stops new bookings and keeps the existing ones.
- **Anulo orarin** (Cancel slot) does NOT cancel the bookings in it: cancel those orders yourself and tell the guests. Only a slot without bookings can be deleted.
- Some slots follow sunrise or sunset ("Ndjek lindjen e diellit"). The weekly generator uses fixed times: check them against the season.
- A slot stops selling 2 hours before it starts (**Cilësimet → Inventari dhe rezervimet**).

### 2.4 Closing nights

- **Dhomat & çmimet → Mbyll ose hap netë** (Close or open nights): room type, first night, last night (both included), how many rooms (or **Të gjitha**, all) → **Zbato** (Apply). Enter 0 to open them again.
- Or under **Rezervimet**: click the night in the grid.
- Booked rooms are never closed: only free ones are.
- To lower the number of rooms of a type for good, change **Dhoma të këtij lloji**. If some nights have more bookings, the change is refused: close those nights one by one instead.

### 2.5 Prices and seasonal rates (owner)

- **Dhomat & çmimet:** change **Çmimi bazë për natë** (base price per night) → **Ruaj dhomat dhe çmimin**.
- **Shto një çmim sezonal** (add a seasonal rate): first night, last night (both included), price per night, note. When two periods overlap, the one added later wins. Delete it and the nights go back to the base price. The **Netët e ardhshme** strip shows each night's price.
- Experiences, packages, the gift card and goods: **Produktet** → the product → **Çmimi dhe sasia** (Price and quantity). **Çmimi i vjetër (i vizatuar)** shows a manual strike-through.
- Prices are stored in lek. The site also shows an approximate euro figure using **Cilësimet → Kursi i euros**. Update it regularly from the Bank of Albania.

### 2.6 Offers and promo codes (owner)

- **Automatic offer** (no code): lowers prices by itself when its conditions are met and shows the old price struck through.
- **Promo code:** the guest types it at checkout. At least 8 letters or digits.
- Fields: type (percent or fixed amount), value, what it applies to (kinds, categories, products), minimum nights, minimum order total, start and end dates, maximum uses, active or not.
- Saving an offer removes its DEMO stamp.
- The demo code `MIRESEVINI10` is visible in the project's public code: change the code before you switch it on.

### 2.7 Messages (Mesazhet)

- They come from the **contact form**, from the **assistant** (when a guest asks for a person) and as **callback requests**.
- **Përgjigju me email** opens your e-mail program; **Telefono** dials the number. When done, **Shëno si të trajtuar** (Mark as handled).
- The field **Email-i për pyetjet që i kalojnë stafit** (Settings → Assistant) is saved, but today the site sends no e-mail: every request arrives only here.

### 2.8 Assistant and FAQ (Asistenti)

- The assistant answers from the FAQ, from live availability and from the weather. When it does not know, it offers the guest to leave a contact for staff (a message in **Mesazhet**).
- **Provo asistentin** (Try the assistant): ask as a visitor would. These questions are not counted in analytics.
- **Pyetje pa përgjigje (30 ditët e fundit)** (unanswered questions) → **Krijo FAQ nga kjo** (Create an FAQ from this).
- Write the facts as they are: the assistant must not promise anything the hotel does not offer.
- **Keywords:** comma-separated, in both languages, with and without ë/ç (e.g. `pelikan, pelikanë, pelican`).
- `{card_min}`, `{bank_h}`, `{hotel_h}`, `{short_h}` in an answer are replaced with the current hold times from Settings. Do not type the numbers yourself.
- **When you confirm the check-in/check-out times, change them in two places:** **Cilësimet → Hoteli** and the FAQ "Në çfarë ore është check-in dhe check-out?". The same goes for the FAQ "Në cilat gjuhë flitet?" (languages spoken).
- Rewrite these FAQs as soon as you know the answer: "A është hoteli i hapur gjithë vitin?" (open all year?), "Çfarë ndodh me një eksperiencë nëse moti është i keq?" (bad weather), "A janë çmimet në lekë apo në euro?" (how guests pay at reception), "Sa kushton hyrja në park?" (park entrance fee).
- **Language model (optional):** when the server has `ANTHROPIC_API_KEY` and **Përdor modelin gjuhësor kur FAQ nuk mjafton** is on, the assistant may phrase answers with Claude (Anthropic), up to the daily cap (300). The privacy page then names Anthropic by itself. Without the key the assistant answers from the FAQ only.

### 2.9 Customers (Klientët)

- The list, each customer's order history and internal notes.
- **Lista e marketingut (CSV)** holds confirmed consents only. Only the owner can download it, and every download is logged.
- **Fshi të dhënat e klientit** (Erase customer data, owner only) for "delete me" requests. It cannot be undone: orders keep their amounts and dates but lose the name, e-mail and phone.
- Before you e-mail offers to customers, you need a way for them to unsubscribe.

### 2.10 Products (Produktet)

- **Texts**, Albanian and English: name, summary, description (plain text; a blank line starts a new paragraph), what is included and what is not.
- **Photos:** **Zgjidh nga biblioteka** (licensed photos, credited on the Credits page) or **Ngarko foto** (at least 480 px wide; iPhone works too). Every photo needs a description, in Albanian and English, of what it really shows.
- **Place on the map**, **Interests**, **Months offered** (no month = all year).
- **Publishing** (owner): Draft, Published, Archived.
- Do not change **Adresa (slug)**: old links break.
- The meeting point, beds, room size and sources cannot be changed from the panel: **[Developer]**.

### 2.11 Settings (Cilësimet, owner)

**Hoteli** (hotel details) · **Vlerësime të verifikuara** (verified ratings) · **Pagesat** (payments; asks for your password again) · **Kursi i euros** · **Rrjetet sociale** · **SEO dhe adresa e sajtit** (also the XML catalogue for Google Merchant Center) · **Inventari dhe rezervimet** · **Privatësia dhe ruajtja e të dhënave** · **Asistenti** · **Rezervimi direkt** · **Ndërtuesi i lidhjeve UTM** · **Fjalëkalimi juaj** · **Serveri** (read only).

Under **Hoteli**, a field marked **E pakonfirmuar** (unconfirmed) is not shown on the site. Type the correct value, or, if the value you see is right, tick **Është e saktë: shfaqe në sajt**; then **Ruaj** (Save).

**Rezervimi direkt** (best direct price): tick it only after checking that your prices are not higher than on Booking.com or other sites.

## 3. DEMO and TEST stamps

The site was built with sample values so it works end to end. The stamps show where they are. Removing a stamp changes no value: it says the value is true. So check the values first.

| Stamp | Where | What it means | How to clear it |
|---|---|---|---|
| **DEMO** on a product | Produktet, Dhomat & çmimet | The price, number of rooms, places, stock or schedule were set for testing. | Owner: check the values → under **Çmimi dhe sasia** tick **Vlerat janë të vërteta…** (rooms: under Dhomat & çmimet) → **Ruaj**. Only then does the site show how many rooms, places or items are free. The ticker line "N rooms free tonight" appears only once every published room type is confirmed. |
| **DEMO** on an offer | Ofertat | The offer or code was set for testing. | Owner: open it, check it → **Ruaj**. |
| "DEMO: sezoni i lartë" | Seasonal rates | The summer price is invented. | Change the price and note, or delete the period. |
| **E pakonfirmuar** | Settings → Hoteli, SEO | A value from public listings, hidden on the site. | Type the right value or tick **Është e saktë: shfaqe në sajt** → **Ruaj**. |
| "Porosi demo" and DEMO on the dashboard/analytics ("Këto shifra përfshijnë të dhëna demo…") | Orders, Customers, Dashboard, Analytics | About 60 invented orders and customers (`@example.com`) and sample visits. Not real sales. | Not from the panel. The **[Developer]** opens the public site on a fresh database without demo data (§4). |
| **TEST** / "Provë · do të lirohet {time}" | Orders | An order "paid" with the card simulator. No real money; never counted. | Nothing: it is released by itself. Or cancel it. |
| **Skicë** (Draft) | Products | Not on the site (today: "Dhomë dyshe", the double room). | Publish it only once you have confirmed that the room type exists and its price. |

## 4. Before going live

The full list, with where each value is changed: `NEEDS_VERIFICATION.md`. In short:

- **Owner, in the panel:** hotel details (legal name, NIPT, phone, e-mail, times), rooms and prices, experiences and schedules, shop, offers, IBAN, euro rate, public site address, social links, the Booking.com score, the open FAQs, photos of the rooms and the restaurant.
- **Owner with a lawyer:** the privacy and terms pages (drafts today), the cancellation and deposit policy, the cookie rule.
- **[Developer]:** a fresh database without demo data (`npm run db:seed`, without `--demo`), the server and proxy, `LIVE_CONTACT`, backups, removing test accounts, `ALLOW_TEST_PAYMENTS` off, the code licence, texts that live in the code.

## 5. Payments

**Today:**
- **Pay at the hotel:** on.
- **Bank transfer:** off until the IBAN and beneficiary are set (**Cilësimet → Pagesat**, with your password again). After any change to the account, the dashboard shows it for 7 days: make sure it was you.
- **Card:** in **TEST** mode. The TEST simulator works only on the development server or with `ALLOW_TEST_PAYMENTS=1`. On the public site card is not offered at all until there is a real contract. Never leave `ALLOW_TEST_PAYMENTS=1` on the public site: a guest could mark their own order as paid.

**With a POK contract:**
1. The hotel signs with POK and receives its keys.
2. **[Developer]** puts them on the server: `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID`, `POK_ENV=production` (`staging` for tests), then restarts the server.
3. Owner: **Cilësimet → SEO dhe adresa e sajtit** → the public address `https://…`. Without it card stays off.
4. Owner: **Cilësimet → Pagesat → Pagesat me kartë** → **LIVE — POK**, with your password.
5. Make one small real payment and check that the order turns "Paguar" by itself. Then refund it.

The server marks an order paid only after reading the payment straight from POK. Refunds are made at POK; then press **Shëno si të rimbursuar**.

**With BKT Virtual POS:** the platform has no BKT connection yet. The **[Developer]** must build one (like the POK one) before it can work. According to BKT's page: €170 once and €110 a year; the per-transaction rate is not published. The bank asks for the NIPT, the QKB extract, the statute and its own forms, and the site must show the company details, privacy, terms and cancellation policy.

**Server variables for payments** (in `.env`, set by the **[Developer]**):

| Variable | What for |
|---|---|
| `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID` | The POK keys. Without them card does not work in LIVE. |
| `POK_ENV` | `production` or `staging`. |
| `ALLOW_TEST_PAYMENTS` | `1` only on test servers. Never on the public site. |

## 6. Weather and live data

- The **Now** page (`/en/now/`), the strip at the top and the home page take the weather from **MET Norway** (free, also for businesses; CC BY 4.0 licence). MET asks for a contact e-mail: set `LIVE_CONTACT` on the server **[Developer]** or confirm the hotel's e-mail under **Cilësimet → Hoteli**. Until then the dashboard shows a warning.
- The sea temperature comes from the NASA JPL MUR satellite analysis, about a day behind, and is shown with its date.
- Sunrise and sunset are computed by the server itself.
- **Optional:** air quality, waves and actual UV need Open-Meteo's **API Standard** plan (€29 a month, read on 23 Oct 2026; VAT not checked). With the key in `OPEN_METEO_API_KEY` and a restart they appear by themselves; without it they stay hidden. The free Open-Meteo tier is for non-commercial use only, so it is not used.
- When a provider does not answer, the site shows "loading" and then the page without readings. There is nothing for you to do.

## 7. Backups

**What to keep:**
- `data/divjaka.db`: everything (orders, customers, products, settings, analytics);
- `data/uploads/`: uploaded photos;
- `.env`: passwords and keys. Keep it separately, somewhere safe.

**How** (**[Developer]**, every day, with the server running, from the project folder):

```sh
node -e "const {DatabaseSync}=require('node:sqlite');const out=process.argv[1]+'/divjaka-'+new Date().toISOString().slice(0,10)+'.db';new DatabaseSync('data/divjaka.db',{readOnly:true}).exec(\"VACUUM INTO '\"+out+\"'\");console.log('saved',out)" /path/to/backups
```

- Do not copy `divjaka.db` alone while the server runs: the latest data sits in `divjaka.db-wal`. The command above makes a complete copy.
- Copy `data/uploads/` too. Keep daily copies for 30 days and one copy a month, off the server and encrypted. The database holds guests' names, e-mails, phones and order links: never put it in Git or anywhere public.
- **Restoring:** stop the server → replace `data/divjaka.db` with the copy → delete `divjaka.db-wal` and `divjaka.db-shm` → start the server. Try it once before launch.
- Never run `npm run db:demo` on the real database: it wipes everything (and refuses when the database looks live).

## 8. Analytics

- **Paneli** (Dashboard): revenue (paid or confirmed orders), orders, average order value, returning customers, room occupancy over the next 30 nights, the path to purchase, latest orders, low stock, nearly full slots, unanswered assistant questions. Pick the period at the top.
- **Analitika** (Analytics): where visitors came from (UTM, referring page, direct), campaigns, orders by source, devices, languages, most viewed pages and products, site searches (red: searches with no result), questions the assistant did not understand, real site speed (Web Vitals).
- The data stays in the hotel's database on your own server. No cookies, no IP addresses, no Google Analytics or other outside service: each browser tab counts as one visitor. Detailed events are kept 180 days; after that only daily totals remain.
- TEST orders are never counted. Demo data is marked DEMO.
- The **UTM link builder** (Settings) makes links for posts and ads, so Analytics shows where visitors came from.
