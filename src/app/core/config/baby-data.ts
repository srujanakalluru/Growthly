// Per-baby data -- generated from the Excel "Setup" sheet by `npm run data`.
// Gitignored on purpose: edit the Setup sheet, never this file.
export const BABY_DATA = {
  name: 'Baby',
  sex: 'male',
  feedingMode: 'auto',
  birthDate: new Date(2024, 0, 1),
  birthDateString: '01/01/2024',

  gestationalAge: {
    weeks: 40,
    days: 0,
    display: '40 weeks 0 days',
    category: 'full term'
  },

  birthMeasurements: {
    weight: null as number | null,
    length: null as number | null,
    headCirc: null as number | null
  },

  earlyWeightEntries: [] as Array<{ date: string; fullDate: string; weight: number | null; height: number | null; headCirc: number | null }>,

  formulaPurchases: [] as Array<{ date: string; units: number; product: string; packSizeG: number; pricePerUnit: number }>,

  formulaCostBasis: {
    product: '',
    packSizeG: 0,
    packPrice: 0,
    packYieldMl: 0,
    sourceNote: ''
  },
};
