/**
 * Checkout helpers (T5): the country suggestions (a datalist — any value may be typed) and the
 * dialling codes for the phone field. Ordered by where Divjakë's visitors are likely to come
 * from (Albania and the region first); names in both languages, written by hand (no Intl for sq).
 */
export const COUNTRIES: Record<'sq' | 'en', string[]> = {
  sq: [
    'Shqipëri', 'Kosovë', 'Maqedonia e Veriut', 'Mali i Zi', 'Greqi', 'Itali', 'Gjermani', 'Mbretëria e Bashkuar', 'Francë', 'Zvicër',
    'Austri', 'Holandë', 'Belgjikë', 'Spanjë', 'Poloni', 'Çeki', 'Hungari', 'Rumani', 'Bullgari', 'Serbi', 'Kroaci', 'Slloveni',
    'Suedi', 'Norvegji', 'Danimarkë', 'Finlandë', 'Irlandë', 'Turqi', 'Shtetet e Bashkuara', 'Kanada', 'Australi',
  ],
  en: [
    'Albania', 'Kosovo', 'North Macedonia', 'Montenegro', 'Greece', 'Italy', 'Germany', 'United Kingdom', 'France', 'Switzerland',
    'Austria', 'Netherlands', 'Belgium', 'Spain', 'Poland', 'Czechia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Croatia', 'Slovenia',
    'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Turkey', 'United States', 'Canada', 'Australia',
  ],
};

export const DIAL: { iso: string; code: string }[] = [
  { iso: 'AL', code: '+355' }, { iso: 'XK', code: '+383' }, { iso: 'MK', code: '+389' }, { iso: 'ME', code: '+382' },
  { iso: 'GR', code: '+30' }, { iso: 'IT', code: '+39' }, { iso: 'DE', code: '+49' }, { iso: 'GB', code: '+44' },
  { iso: 'FR', code: '+33' }, { iso: 'CH', code: '+41' }, { iso: 'AT', code: '+43' }, { iso: 'NL', code: '+31' },
  { iso: 'BE', code: '+32' }, { iso: 'ES', code: '+34' }, { iso: 'PL', code: '+48' }, { iso: 'CZ', code: '+420' },
  { iso: 'HU', code: '+36' }, { iso: 'RO', code: '+40' }, { iso: 'BG', code: '+359' }, { iso: 'RS', code: '+381' },
  { iso: 'HR', code: '+385' }, { iso: 'SI', code: '+386' }, { iso: 'SE', code: '+46' }, { iso: 'NO', code: '+47' },
  { iso: 'DK', code: '+45' }, { iso: 'FI', code: '+358' }, { iso: 'IE', code: '+353' }, { iso: 'TR', code: '+90' },
  { iso: 'US', code: '+1' }, { iso: 'AU', code: '+61' },
];
