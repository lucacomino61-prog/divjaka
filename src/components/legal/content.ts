/**
 * content.ts — the privacy notice and the booking terms (T7). DRAFTS: written from what this
 * platform really does (code and settings), with the law named in research/business.json
 * (verified entries only). Anything the owner must decide is said as such, never invented:
 * see NEEDS_VERIFICATION.md → "Live data, assistant, itinerary, contact, legal (T7)".
 * Values that live in settings (retention days, hold times, controller details) are passed in, so
 * the text follows the admin.
 */
export type Lang = 'sq' | 'en';
export type Block = { p: { sq: string; en: string } } | { ul: { sq: string; en: string }[] } | { dl: { k: { sq: string; en: string }; v: { sq: string; en: string } }[] };
export interface Section { id: string; h: { sq: string; en: string }; blocks: Block[] }

export interface LegalContext {
  controller: { name: string; legal: string; nipt: string; address: string };
  privacy: { events_days: number; messages_days: number; orders_days: number };
  holds: { card_min: number; bank_h: number; hotel_h: number; short_h: number };
  methods: { hotel: boolean; bank: boolean; card: boolean };
  ai: boolean;
}

const P = (sq: string, en: string): Block => ({ p: { sq, en } });
const UL = (...items: [string, string][]): Block => ({ ul: items.map(([sq, en]) => ({ sq, en })) });

export function privacySections(c: LegalContext): Section[] {
  const who = c.controller.legal
    ? P(`Kontrollues i të dhënave është ${c.controller.legal}${c.controller.nipt ? `, NIPT ${c.controller.nipt}` : ''}, që drejton Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}.`, `The controller is ${c.controller.legal}${c.controller.nipt ? `, tax number ${c.controller.nipt}` : ''}, which runs Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}.`)
    : P(`Kontrollues i të dhënave është Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}. Emri ligjor dhe NIPT-i i shoqërisë do të shtohen këtu pasi t’i konfirmojë hoteli.`, `The controller is Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}. The company’s legal name and tax number will be added here once the hotel confirms them.`);
  return [
    {
      id: 'kush', h: { sq: 'Kush i trajton të dhënat', en: 'Who handles the data' },
      blocks: [who, P('Për çdo pyetje mbi të dhënat tuaja shkruani nga faqja e kontaktit, me temën "Të dhënat e mia".', 'For any question about your data, write through the contact page with the subject "My data".')],
    },
    {
      id: 'shkurt', h: { sq: 'Shkurt', en: 'In short' },
      blocks: [UL(
        ['Nuk përdorim cookies gjurmuese dhe as reklama. Vizitorët nuk marrin asnjë cookie.', 'We use no tracking cookies and no advertising. Visitors get no cookies at all.'],
        ['Statistikat e vizitave janë tonat, të përgjithshme, pa emra dhe pa adresa IP të ruajtura.', 'Visit statistics are our own, aggregate, without names and without stored IP addresses.'],
        ['Kur rezervoni ose na shkruani, ruajmë atë që na jepni, vetëm sa duhet për t’ju shërbyer.', 'When you book or write to us, we keep what you give us, only as long as needed to serve you.'],
        ['Shporta dhe zgjedhjet tuaja qëndrojnë në shfletuesin tuaj.', 'Your cart and choices stay in your browser.'],
      )],
    },
    {
      id: 'cfare', h: { sq: 'Çfarë ruajmë dhe pse', en: 'What we keep and why' },
      blocks: [
        { dl: [
          { k: { sq: 'Porositë dhe rezervimet', en: 'Orders and bookings' }, v: { sq: `Emri, emaili, telefoni, shteti, shënimet tuaja, çfarë rezervuat, shumat dhe mënyra e pagesës — për të përmbushur rezervimin dhe për detyrimet ligjore të hotelit. Porositë e anuluara që nuk u paguan kurrë anonimizohen pas ${c.privacy.orders_days} ditësh (emri, emaili, telefoni dhe shënimet fshihen; shumat mbeten). Afatin e ruajtjes së porosive të kryera e përcakton hoteli sipas detyrimeve kontabël.`, en: `Name, e-mail, phone, country, your notes, what you booked, the amounts and the payment method — to fulfil the booking and for the hotel’s legal obligations. Cancelled orders that were never paid are anonymised after ${c.privacy.orders_days} days (name, e-mail, phone and notes removed; amounts kept). How long completed orders are kept is set by the hotel under its accounting obligations.` } },
          { k: { sq: 'Mesazhet', en: 'Messages' }, v: { sq: `Çfarë shkruani te kontakti ose te asistenti kur kërkoni stafin (emri, emaili ose telefoni, mesazhi) — për t’ju përgjigjur. Mesazhet e trajtuara fshihen pas ${c.privacy.messages_days} ditësh.`, en: `What you write on the contact page or to the assistant when you ask for the staff (name, e-mail or phone, message) — to answer you. Handled messages are deleted after ${c.privacy.messages_days} days.` } },
          { k: { sq: 'Ofertat me email', en: 'Offers by e-mail' }, v: { sq: 'Vetëm nëse e zgjidhni kutinë në arkë; pëlqimi regjistrohet kur porosia paguhet ose kur stafi e konfirmon. Mund ta tërhiqni kur të doni, pa asnjë kosto.', en: 'Only if you tick the box at checkout; the consent is recorded when the order is paid or the staff confirm it. You can withdraw it whenever you like, at no cost.' } },
          { k: { sq: 'Statistikat', en: 'Statistics' }, v: { sq: `Faqet dhe produktet që shihni, kërkimet, pyetjet drejtuar asistentit dhe matjet e shpejtësisë (Web Vitals), me një numër të rastësishëm për skedën (sessionStorage "dv-sid"), pa cookies. Nga kërkesa ruhen vetëm lloji i pajisjes, gjuha, faqja dhe domeni nga erdhët; adresa IP nuk ruhet. Pas ${c.privacy.events_days} ditësh ngjarjet bashkohen në numra ditorë dhe fshihen.`, en: `Pages and products viewed, searches, questions to the assistant and speed measurements (Web Vitals), with a random number per tab (sessionStorage "dv-sid"), no cookies. Of the request only the device type, language, page and referring domain are kept; the IP address is not stored. After ${c.privacy.events_days} days the events are merged into daily counts and deleted.` } },
          { k: { sq: 'Siguria', en: 'Security' }, v: { sq: 'Adresa IP përdoret vetëm për pak kohë në kujtesën e serverit, për të kufizuar abuzimet (p.sh. shumë mesazhe radhazi). Hyrjet e stafit në panel regjistrohen me adresë të shkurtuar.', en: 'The IP address is used only briefly in the server’s memory, to limit abuse (e.g. many messages in a row). Staff sign-ins to the admin are logged with a shortened address.' } },
        ] },
      ],
    },
    {
      id: 'shfletuesi', h: { sq: 'Në shfletuesin tuaj', en: 'In your browser' },
      blocks: [
        P('Këto ruhen vetëm në pajisjen tuaj dhe nuk na dërgohen, përveç kur i përdorni (p.sh. shporta kur porositni):', 'These stay on your device and are not sent to us, except when you use them (e.g. the cart when you order):'),
        UL(
          ['localStorage: "dv-cart", "dv-cart-x" (shporta), "dv-prefs" (interesat, monedha), "dv-viewed" (të parët së fundi), "dv-motion" (animacionet të ndalura).', 'localStorage: "dv-cart", "dv-cart-x" (the cart), "dv-prefs" (interests, currency), "dv-viewed" (recently viewed), "dv-motion" (animations stopped).'],
          ['sessionStorage, fshihen kur mbyllni skedën: "dv-sid", "dv-seen", "dv-live", "dv-assistant" (biseda me asistentin), "dv-promo", "dv-checkout", "dv-utm", "dv-cart-checked".', 'sessionStorage, cleared when you close the tab: "dv-sid", "dv-seen", "dv-live", "dv-assistant" (the assistant conversation), "dv-promo", "dv-checkout", "dv-utm", "dv-cart-checked".'],
          ['Te "Rezervimet e mia" → "Fshi të dhënat e mia nga ky shfletues" i hiqni të gjitha me një klik.', 'In "My bookings" → "Delete my data from this browser" you remove them all in one click.'],
          ['Cookies përdor vetëm paneli i stafit të hotelit (hyrja në /admin).', 'Only the hotel staff’s admin panel uses cookies (signing in at /admin).'],
        ),
      ],
    },
    {
      id: 'te-tjeret', h: { sq: 'Me kë ndahen', en: 'Who else is involved' },
      blocks: [UL(
        ['Pagesa me kartë, kur është aktive, bëhet te ofruesi i pagesave: të dhënat e kartës shkojnë drejt tij, jo te ne.', 'Card payment, when active, happens with the payment provider: card details go straight to them, not to us.'],
        ['Moti dhe deti merren nga serveri ynë (MET Norway, NASA JPL): asnjë e dhënë e juaja nuk u dërgohet.', 'Weather and sea readings are fetched by our server (MET Norway, NASA JPL): none of your data is sent to them.'],
        ['Shkronjat, fotot dhe harta shërbehen nga sajti ynë; nuk ka skripte të palëve të treta.', 'Fonts, photos and the chart are served from our own site; there are no third-party scripts.'],
        ...(c.ai ? [['Asistenti mund t’ia dërgojë tekstin e pyetjes (pa emrin, emailin ose telefonin tuaj) shërbimit të inteligjencës artificiale Anthropic për të formuluar përgjigjen, kur pyetjet e hotelit nuk mjaftojnë.', 'The assistant may send the text of your question (without your name, e-mail or phone) to the Anthropic AI service to phrase an answer, when the hotel’s own questions are not enough.'] as [string, string]] : []),
        ['Ofruesi i hostimit të sajtit do të shënohet këtu kur të vendoset.', 'The site’s hosting provider will be named here once chosen.'],
      )],
    },
    {
      id: 'te-drejtat', h: { sq: 'Të drejtat tuaja', en: 'Your rights' },
      blocks: [
        P('Sipas Ligjit nr. 124/2024 "Për mbrojtjen e të dhënave personale" mund të kërkoni të shihni të dhënat tuaja, t’i korrigjoni, t’i fshini, të kundërshtoni përdorimin e tyre (edhe për marketing, në çdo kohë) ose t’i merrni në një format të lexueshëm. Kërkesat bëhen nga faqja e kontaktit.', 'Under Law No. 124/2024 "On the protection of personal data" you may ask to see your data, correct it, delete it, object to its use (including for marketing, at any time) or receive it in a readable format. Requests go through the contact page.'),
        P('Nëse mendoni se të dhënat tuaja nuk trajtohen si duhet, mund t’i drejtoheni Komisionerit për të Drejtën e Informimit dhe Mbrojtjen e të Dhënave Personale.', 'If you think your data is not handled properly, you may turn to the Commissioner for the Right to Information and Personal Data Protection.'),
      ],
    },
  ];
}

export function termsSections(c: LegalContext): Section[] {
  const methods = [c.methods.hotel && ['pagesë në hotel', 'pay at the hotel'], c.methods.bank && ['transfertë bankare', 'bank transfer'], c.methods.card && ['kartë', 'card']].filter(Boolean) as [string, string][];
  const seller = c.controller.legal
    ? P(`Shitësi është ${c.controller.legal}${c.controller.nipt ? `, NIPT ${c.controller.nipt}` : ''}, Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}.`, `The seller is ${c.controller.legal}${c.controller.nipt ? `, tax number ${c.controller.nipt}` : ''}, Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}.`)
    : P(`Shitësi është Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}. Emri tregtar, NIPT-i dhe të dhënat e regjistrimit, që Ligji nr. 10128/2009 "Për tregtinë elektronike" kërkon të shfaqen, do të shtohen pasi t’i konfirmojë hoteli.`, `The seller is Hotel Pelikan${c.controller.address ? `, ${c.controller.address}` : ''}. The trade name, tax number and registration details that Law No. 10128/2009 "On electronic commerce" asks to show will be added once the hotel confirms them.`);
  return [
    { id: 'shitesi', h: { sq: 'Kush shet', en: 'Who sells' }, blocks: [seller] },
    {
      id: 'cmimet', h: { sq: 'Çmimet', en: 'Prices' },
      blocks: [UL(
        ['Çmimet janë në lekë dhe llogariten nga serveri në çdo hap: shuma që paguani është ajo e hapit të fundit të arkës.', 'Prices are in lek and worked out by the server at every step: the amount you pay is the one on the last step of checkout.'],
        ['Shumat në euro janë vetëm përafërsi me kursin e vendosur nga hoteli; pagesa bëhet në lekë.', 'Amounts in euros are only an approximation at the rate the hotel sets; payment is made in lek.'],
        ['Ofertat dhe kodet promocionale zbatohen nga serveri, sipas kushteve të secilës.', 'Offers and promo codes are applied by the server, under each one’s conditions.'],
      )],
    },
    {
      id: 'rezervimi', h: { sq: 'Rezervimi dhe mbajtja e vendeve', en: 'Booking and holding places' },
      blocks: [
        P('Kur dërgoni porosinë, dhomat, vendet në eksperienca ose mallrat mbahen për ju. Nëse porosia nuk paguhet ose nuk konfirmohet nga hoteli brenda afatit, ato lirohen vetë:', 'When you send an order, the rooms, experience places or goods are held for you. If the order is not paid or confirmed by the hotel in time, they are released automatically:'),
        UL(
          [`Kartë: ${c.holds.card_min} minuta për të përfunduar pagesën.`, `Card: ${c.holds.card_min} minutes to finish paying.`],
          [`Transfertë bankare: deri në ${c.holds.bank_h} orë.`, `Bank transfer: up to ${c.holds.bank_h} hours.`],
          [`Pagesë në hotel: ${c.holds.hotel_h} orë, derisa hoteli ta konfirmojë.`, `Pay at the hotel: ${c.holds.hotel_h} hours, until the hotel confirms it.`],
          [`Qëndrimet e gjata, ato shumë përpara ose porositë në momente me shumë kërkesa mund të mbahen ${c.holds.short_h} orë. Faqja e porosisë tregon gjithmonë afatin e saktë.`, `Long stays, stays far ahead or orders at busy moments may be held for ${c.holds.short_h} hours. The order page always shows the exact deadline.`],
        ),
        P('Për pagesën në hotel dhe transfertën bankare kërkohet numri i telefonit, që hoteli të mund t’ju konfirmojë rezervimin.', 'For paying at the hotel and bank transfer a phone number is required, so the hotel can confirm your booking.'),
      ],
    },
    {
      id: 'pagesa', h: { sq: 'Pagesa', en: 'Payment' },
      blocks: [
        P(`Mënyrat që ofrohen tani: ${methods.map((m) => m[0]).join(', ') || '—'}. Arka tregon vetëm ato që janë aktive në atë moment.`, `Methods offered now: ${methods.map((m) => m[1]).join(', ') || '—'}. Checkout shows only those active at that moment.`),
        UL(
          ['Me kartë: pagesa bëhet te ofruesi i pagesave; porosia shënohet e paguar vetëm kur ofruesi e konfirmon.', 'By card: payment is made with the payment provider; the order is marked paid only when the provider confirms it.'],
          ['Me transfertë: përdorni IBAN-in dhe kodin e porosisë që shfaqen pas porosisë.', 'By transfer: use the IBAN and the order code shown after ordering.'],
          ['Në hotel: paguani në recepsion, në lekë.', 'At the hotel: pay at reception, in lek.'],
        ),
      ],
    },
    {
      id: 'anulimi', h: { sq: 'Anulimi dhe ndryshimet', en: 'Cancellation and changes' },
      blocks: [
        P('Kushtet e anulimit dhe të rimbursimit përcaktohen nga hoteli dhe do t’ju konfirmohen me email për çdo rezervim. Deri atëherë asnjë kusht anulimi në këtë faqe nuk është përfundimtar.', 'Cancellation and refund terms are set by the hotel and will be confirmed to you by e-mail for each booking. Until then no cancellation term on this page is final.'),
        P('Për të anuluar ose ndryshuar, shkruani stafit me kodin e porosisë nga faqja e kontaktit. Porositë e papaguara dhe të pakonfirmuara anulohen vetë kur u mbaron afati.', 'To cancel or change, write to the staff with your order code through the contact page. Unpaid, unconfirmed orders cancel themselves when their hold ends.'),
      ],
    },
    {
      id: 'eksperiencat', h: { sq: 'Eksperiencat, kartat dhuratë dhe mallrat', en: 'Experiences, gift cards and goods' },
      blocks: [UL(
        ['Orari, vendtakimi, kohëzgjatja dhe çfarë përfshihet janë në faqen e secilës eksperiencë.', 'The time, meeting point, length and what is included are on each experience’s page.'],
        ['Afatin e vlefshmërisë së kartave dhuratë e konfirmon hoteli.', 'The hotel confirms how long gift cards are valid.'],
        ['Marrja ose dorëzimi i mallrave konfirmohet nga hoteli pas porosisë.', 'Collection or delivery of goods is confirmed by the hotel after the order.'],
      )],
    },
    {
      id: 'konsumatori', h: { sq: 'Të drejtat e konsumatorit', en: 'Consumer rights' },
      blocks: [
        P('Blerjet në këtë sajt rregullohen nga ligji shqiptar, përfshirë Ligjin nr. 9902/2008 "Për mbrojtjen e konsumatorëve" dhe Ligjin nr. 10128/2009 "Për tregtinë elektronike". Nëse dhe si zbatohet e drejta e tërheqjes për rezervime akomodimi dhe eksperienca me datë të caktuar do ta konfirmojë hoteli.', 'Purchases on this site are governed by Albanian law, including Law No. 9902/2008 "On consumer protection" and Law No. 10128/2009 "On electronic commerce". Whether and how the right of withdrawal applies to accommodation and to experiences on a fixed date will be confirmed by the hotel.'),
        P('Për ankesa shkruani nga faqja e kontaktit.', 'For complaints, write through the contact page.'),
      ],
    },
  ];
}
