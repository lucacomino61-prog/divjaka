/**
 * Assistant reply strings (T7) — overrides the engine's defaults in src/lib/assistant/index.ts
 * (loaded there with import.meta.glob). Albanian is the source; keep {placeholders}.
 */
export const strings = {
  sq: {
    greeting: 'Përshëndetje! Pyesni për dhomat dhe datat e lira, eksperiencat në park dhe lagunë, pagesat ose rezervimin tuaj.',
    rooms_free: 'Për {range} ({nights}) kemi të lira:',
    rooms_none: 'Për {range} nuk ka dhoma të lira online. Provoni data të tjera, ose lini kontaktin dhe stafi ju shkruan.',
    sessions_free: '{Date}, ka këto orare me vende të lira:',
    sessions_none: '{Date}, nuk ka orare me vende të lira online.',
    ask_dates: 'Për cilat data? Shkruani p.sh. "12–14 korrik" ose "të premten për 2 netë".',
    recommend: 'Disa ide që mund t’ju pëlqejnë:',
    miss: 'Për këtë nuk kam përgjigje të sigurt. Dëshironi që t’ju shkruajë stafi i hotelit? Lini emrin dhe një email ose telefon.',
    handoff: 'Sigurisht. Lini emrin dhe një email ose telefon, dhe stafi i hotelit ju kontakton.',
    contact_saved: 'Faleminderit! Mesazhi shkoi te stafi i Hotel Pelikanit. Do t’ju kontaktojnë sa më shpejt.',
    contact_missing: 'Na duhet një email ose numër telefoni që stafi t’ju kontaktojë.',
    chip_rooms: 'Dhomë për këtë fundjavë',
    chip_tours: 'Çfarë eksperiencash keni?',
    chip_pay: 'Si mund të paguaj?',
    chip_staff: 'Dua të flas me stafin',
    chip_ideas: 'Çfarë të bëj në Divjakë?',
  },
  en: {
    greeting: 'Hello! Ask about rooms and free dates, the experiences in the park and on the lagoon, payments or your booking.',
    miss: 'I do not have a reliable answer to that. Would you like the hotel staff to write to you? Leave your name and an e-mail or phone number.',
    contact_saved: 'Thank you! Your message went to the Hotel Pelikan staff. They will contact you as soon as they can.',
  },
};
