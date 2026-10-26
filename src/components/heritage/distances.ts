/**
 * Driving distances from Divjakë town centre (research/heritage.json: OSRM free-flow routes on
 * OpenStreetMap data, computed 2026-10-23). The numbers are transcribed from the facts named in
 * `fact`; the table prints that fact's source.
 */
export interface Distance { fact: string; to: { sq: string; en: string }; km: number; min: number }

export const DISTANCE_FACTS: Distance[] = [
  { fact: 'prac-06', to: { sq: 'Qendra e Vizitorëve e parkut', en: 'The park Visitor Centre' }, km: 4, min: 10 },
  { fact: 'prac-05', to: { sq: 'Lushnja', en: 'Lushnjë' }, km: 20, min: 30 },
  { fact: 'hist-13', to: { sq: 'Manastiri i Ardenicës', en: 'Ardenica Monastery' }, km: 35, min: 40 },
  { fact: 'prac-04', to: { sq: 'Fieri', en: 'Fier' }, km: 45, min: 47 },
  { fact: 'hist-16', to: { sq: 'Apolonia', en: 'Apollonia' }, km: 52, min: 55 },
  { fact: 'prac-03', to: { sq: 'Durrësi', en: 'Durrës' }, km: 54, min: 50 },
  { fact: 'prac-07', to: { sq: 'Berati', en: 'Berat' }, km: 60, min: 70 },
  { fact: 'prac-02', to: { sq: 'Aeroporti i Tiranës (Rinas)', en: 'Tirana Airport (Rinas)' }, km: 79, min: 80 },
  { fact: 'hist-17', to: { sq: 'Bylisi', en: 'Byllis' }, km: 79, min: 90 },
  { fact: 'prac-01', to: { sq: 'Tirana (qendra)', en: 'Tirana (centre)' }, km: 85, min: 80 },
];

export function duration(min: number, lang: 'sq' | 'en'): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (lang === 'sq') return [h ? `${h} orë` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}
