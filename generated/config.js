// Per-baby configuration — generated from the Excel "Setup" sheet by `npm run data`.
// Gitignored on purpose: edit the Setup sheet, never this file directly.
const BABY_CONFIG = {
// <<< SETUP:BEGIN >>>
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
    weight: null,
    length: null,
    headCirc: null
  },

  earlyWeightEntries: [
  ],
// <<< SETUP:END >>>

// <<< SETUP:PURCHASES:BEGIN >>>
  formulaPurchases: [
  ],
// <<< SETUP:PURCHASES:END >>>

  formulaCostBasis: {
    product: '',
    packSizeG: 0,
    packPrice: 0,
    packYieldMl: 0,
    sourceNote: ''
  },
};

module.exports = BABY_CONFIG;
