const fs = require('fs');
const path = require('path');
const PROMPT = require('./prompt-template');

const CONFIG = {
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || 'your-api-key-here',
  // 'ai' = always call Gemini, 'manual' = always print/copy prompt, '' = auto (ai if key set)
  mode: (process.env.INFERENCE_MODE || '').toLowerCase(),
  // Override with GEMINI_MODEL (e.g. gemini-2.5-pro). Default supports large JSON output.
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  outputPath: './public/inference/inference.json',
  dataPath: './generated/feeding-data.csv',
  sessionsPath: './generated/sessions-data.csv',
  configPath: './generated/config.js',
  medicalContextPath: './generated/Medical context.txt'
};

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};

    headers.forEach((header, index) => {
      const value = values[index]?.trim() || '';
      row[header] = (value === '' || isNaN(value)) ? value : parseFloat(value);
    });

    rows.push(row);
  }

  return rows;
}

function loadBabyConfig() {
  const configContent = fs.readFileSync(CONFIG.configPath, 'utf8');

  const extract = (pattern, defaultVal = '') => {
    const match = configContent.match(pattern);
    return match ? match[1] : defaultVal;
  };

  const extractNum = (pattern, defaultVal = 0) => {
    const val = extract(pattern);
    return val ? parseFloat(val) : defaultVal;
  };

  return {
    name: extract(/name:\s*['"]([^'"]+)['"]/, 'Baby'),
    feedingMode: extract(/feedingMode:\s*['"]([^'"]+)['"]/, 'auto'),
    birthDate: (() => {
      const strMatch = configContent.match(/birthDate:\s*new Date\(['"]([^'"]+)['"]\)/);
      if (strMatch) return new Date(strMatch[1]);
      const numMatch = configContent.match(/birthDate:\s*new Date\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (numMatch) return new Date(parseInt(numMatch[1]), parseInt(numMatch[2]), parseInt(numMatch[3]));
      return new Date();
    })(),
    birthDateString: extract(/birthDateString:\s*['"]([^'"]+)['"]/),
    gestationalAge: {
      weeks: parseInt(extract(/weeks:\s*(\d+)/, '37')),
      days: parseInt(extract(/days:\s*(\d+)/, '0')),
      display: extract(/display:\s*['"]([^'"]+)['"]/, '37 weeks 1 day'),
      category: extract(/category:\s*['"]([^'"]+)['"]/, 'early term')
    },
    birthMeasurements: {
      weight: extractNum(/birthMeasurements:\s*{[^}]*weight:\s*([\d.]+)/),
      length: extractNum(/birthMeasurements:\s*{[^}]*length:\s*([\d.]+)/),
      headCirc: extractNum(/birthMeasurements:\s*{[^}]*headCirc:\s*([\d.]+)/)
    },
    whoTargets: {
      weightGain: {
        days0to90: {
          min: extractNum(/days0to90:\s*{\s*min:\s*([\d.]+)/, 17.5),
          target: extractNum(/days0to90:\s*{[^}]*target:\s*([\d.]+)/, 25),
          max: extractNum(/days0to90:\s*{[^}]*max:\s*([\d.]+)/, 36)
        },
        days91plus: {
          min: extractNum(/days91plus:\s*{\s*min:\s*([\d.]+)/, 14),
          target: extractNum(/days91plus:\s*{[^}]*target:\s*([\d.]+)/, 20),
          max: extractNum(/days91plus:\s*{[^}]*max:\s*([\d.]+)/, 29)
        }
      },
      velocity: {
        weeks0to13: {
          min: extractNum(/weeks0to13:\s*{\s*min:\s*([\d.]+)/, 175),
          max: extractNum(/weeks0to13:\s*{[^}]*max:\s*([\d.]+)/, 245)
        },
        weeks14plus: {
          min: extractNum(/weeks14plus:\s*{\s*min:\s*([\d.]+)/, 140),
          max: extractNum(/weeks14plus:\s*{[^}]*max:\s*([\d.]+)/, 210)
        }
      }
    },
    getWHOVelocityRange: function(days) {
      if (days <= 90) {
        return this.whoTargets.velocity.weeks0to13;
      }
      return this.whoTargets.velocity.weeks14plus;
    },
    _whoWeightLMS: {
      0:{L:0.3487,M:3.3464,S:0.14602},14:{L:0.29396,M:3.86363,S:0.14047},
      28:{L:0.23923,M:4.38086,S:0.13492},42:{L:0.21728,M:4.88748,S:0.13011},
      56:{L:0.20224,M:5.39187,S:0.12547},70:{L:0.19004,M:5.80995,S:0.12188},
      84:{L:0.17937,M:6.18192,S:0.11885},98:{L:0.16974,M:6.51377,S:0.11637},
      112:{L:0.16123,M:6.80175,S:0.11448},126:{L:0.15309,M:7.07328,S:0.11283},
      140:{L:0.14582,M:7.30709,S:0.11174},154:{L:0.13867,M:7.53582,S:0.11073},
      168:{L:0.13233,M:7.7306,S:0.11017},182:{L:0.12598,M:7.92537,S:0.1096},
      196:{L:0.12029,M:8.09356,S:0.10933},210:{L:0.11464,M:8.26051,S:0.10908},
      224:{L:0.10934,M:8.41132,S:0.10895},238:{L:0.10414,M:8.55762,S:0.10886},
      252:{L:0.09919,M:8.69507,S:0.10882},266:{L:0.09441,M:8.82679,S:0.10881},
      280:{L:0.08977,M:8.95394,S:0.10883},294:{L:0.0853,M:9.07513,S:0.10888},
      308:{L:0.08093,M:9.19439,S:0.10893},322:{L:0.07679,M:9.30813,S:0.109},
      336:{L:0.07266,M:9.42141,S:0.10907},350:{L:0.06871,M:9.52982,S:0.10915},
      364:{L:0.06475,M:9.63822,S:0.10924},378:{L:0.06117,M:9.74046,S:0.10936},
      392:{L:0.05763,M:9.8421,S:0.10949},406:{L:0.05409,M:9.94374,S:0.10962},
      420:{L:0.05055,M:10.04538,S:0.10974},448:{L:0.04347,M:10.24866,S:0.10999},
      476:{L:0.037,M:10.44444,S:0.11031},504:{L:0.03081,M:10.63692,S:0.11065},
      532:{L:0.02461,M:10.8294,S:0.111},560:{L:0.01868,M:11.01955,S:0.11138},
      588:{L:0.0131,M:11.20663,S:0.11181},616:{L:0.00752,M:11.39372,S:0.11225},
      644:{L:0.00202,M:11.58042,S:0.1127},672:{L:-0.00307,M:11.76528,S:0.1132},
      700:{L:-0.00816,M:11.95014,S:0.11371},728:{L:-0.01325,M:12.13499,S:0.11421}
    },
    _whoLengthLMS: {
      0:{L:1.0,M:49.8842,S:0.03795},14:{L:1.0,M:52.10869,S:0.03684},28:{L:1.0,M:54.33318,S:0.03573},
      42:{L:1.0,M:56.12716,S:0.03504},56:{L:1.0,M:57.83041,S:0.03444},70:{L:1.0,M:59.32035,S:0.03404},
      84:{L:1.0,M:60.69634,S:0.03374},98:{L:1.0,M:61.95895,S:0.03349},112:{L:1.0,M:63.09761,S:0.03331},
      126:{L:1.0,M:64.18418,S:0.03315},140:{L:1.0,M:65.15125,S:0.03304},154:{L:1.0,M:66.1031,S:0.03294},
      168:{L:1.0,M:66.95308,S:0.0329},182:{L:1.0,M:67.80306,S:0.03285},196:{L:1.0,M:68.44386,S:0.03288},
      210:{L:1.0,M:69.07497,S:0.03291},224:{L:1.0,M:69.70609,S:0.03295},238:{L:1.0,M:70.3372,S:0.03298},
      252:{L:1.0,M:70.96831,S:0.03301},266:{L:1.0,M:71.59942,S:0.03304},280:{L:1.0,M:72.20403,S:0.03309},
      294:{L:1.0,M:72.77403,S:0.03317},308:{L:1.0,M:73.34403,S:0.03324},322:{L:1.0,M:73.91402,S:0.03331},
      336:{L:1.0,M:74.48402,S:0.03339},350:{L:1.0,M:75.05401,S:0.03346},364:{L:1.0,M:75.62401,S:0.03353},
      378:{L:1.0,M:76.13478,S:0.03361},392:{L:1.0,M:76.63974,S:0.03369},406:{L:1.0,M:77.14471,S:0.03377},
      420:{L:1.0,M:77.64967,S:0.03385},448:{L:1.0,M:78.6596,S:0.03402},476:{L:1.0,M:79.66953,S:0.03418},
      504:{L:1.0,M:80.67946,S:0.03434},532:{L:1.0,M:81.68939,S:0.0345},560:{L:1.0,M:82.63151,S:0.03465},
      588:{L:1.0,M:83.48493,S:0.03478},616:{L:1.0,M:84.33834,S:0.03491},644:{L:1.0,M:85.19176,S:0.03504},
      672:{L:1.0,M:86.04517,S:0.03517},700:{L:1.0,M:86.89859,S:0.0353},728:{L:1.0,M:87.752,S:0.03543}
    },
    _whoHeadCircLMS: {
      0:{L:1.0,M:34.4618,S:0.03686},14:{L:1.0,M:35.75619,S:0.03432},28:{L:1.0,M:37.05058,S:0.03177},
      42:{L:1.0,M:37.97968,S:0.03081},56:{L:1.0,M:38.83178,S:0.03019},70:{L:1.0,M:39.54372,S:0.02973},
      84:{L:1.0,M:40.18078,S:0.02937},98:{L:1.0,M:40.7592,S:0.02907},112:{L:1.0,M:41.27351,S:0.02884},
      126:{L:1.0,M:41.76102,S:0.02864},140:{L:1.0,M:42.187,S:0.02849},154:{L:1.0,M:42.60382,S:0.02836},
      168:{L:1.0,M:42.95934,S:0.02827},182:{L:1.0,M:43.31486,S:0.02817},196:{L:1.0,M:43.53101,S:0.02815},
      210:{L:1.0,M:43.74071,S:0.02813},224:{L:1.0,M:43.95041,S:0.02811},238:{L:1.0,M:44.1601,S:0.02809},
      252:{L:1.0,M:44.3698,S:0.02806},266:{L:1.0,M:44.5795,S:0.02804},280:{L:1.0,M:44.78919,S:0.02802},
      294:{L:1.0,M:44.99889,S:0.028},308:{L:1.0,M:45.20859,S:0.02798},322:{L:1.0,M:45.41829,S:0.02796},
      336:{L:1.0,M:45.62798,S:0.02793},350:{L:1.0,M:45.83768,S:0.02791},364:{L:1.0,M:46.04738,S:0.02789},
      392:{L:1.0,M:46.23207,S:0.02793},420:{L:1.0,M:46.4058,S:0.02797},448:{L:1.0,M:46.57952,S:0.02801},
      476:{L:1.0,M:46.75325,S:0.02806},504:{L:1.0,M:46.92698,S:0.0281},532:{L:1.0,M:47.1007,S:0.02814},
      560:{L:1.0,M:47.27443,S:0.02818},588:{L:1.0,M:47.44816,S:0.02823},616:{L:1.0,M:47.62188,S:0.02827},
      644:{L:1.0,M:47.79561,S:0.02831},672:{L:1.0,M:47.96934,S:0.02835},700:{L:1.0,M:48.14306,S:0.02839},
      728:{L:1.0,M:48.31679,S:0.02844}
    },
    _whoBmiLMS: {
      0:{L:-1.6384,M:13.4116,S:0.09078},14:{L:-1.57621,M:14.10601,S:0.08679},28:{L:-1.51403,M:14.80042,S:0.08279},
      42:{L:-1.45218,M:15.45523,S:0.07998},56:{L:-1.39041,M:16.10169,S:0.07742},70:{L:-1.33757,M:16.59056,S:0.07565},
      84:{L:-1.2895,M:16.99524,S:0.07431},98:{L:-1.24625,M:17.32967,S:0.07325},112:{L:-1.20774,M:17.61085,S:0.07243},
      126:{L:-1.17117,M:17.84,S:0.07179},140:{L:-1.13645,M:18.02773,S:0.07132},154:{L:-1.10316,M:18.17898,S:0.07099},
      168:{L:-1.07138,M:18.29688,S:0.07077},182:{L:-1.04093,M:18.38365,S:0.07066},196:{L:-1.01177,M:18.44329,S:0.07063},
      210:{L:-0.98388,M:18.47827,S:0.07068},224:{L:-0.95725,M:18.49219,S:0.07079},238:{L:-0.93188,M:18.48748,S:0.07096},
      252:{L:-0.90771,M:18.46798,S:0.07117},266:{L:-0.88471,M:18.43505,S:0.07143},280:{L:-0.8629,M:18.39244,S:0.07172},
      294:{L:-0.84219,M:18.34185,S:0.07204},308:{L:-0.82252,M:18.28458,S:0.07239},322:{L:-0.80391,M:18.22175,S:0.07275},
      336:{L:-0.7863,M:18.15481,S:0.07313},350:{L:-0.76963,M:18.08451,S:0.07352},364:{L:-0.75388,M:18.01179,S:0.07392},
      392:{L:-0.72471,M:17.86516,S:0.07474},420:{L:-0.69778,M:17.72099,S:0.07558},448:{L:-0.67296,M:17.58155,S:0.07643},
      476:{L:-0.65012,M:17.44842,S:0.07729},504:{L:-0.62911,M:17.32263,S:0.07815},532:{L:-0.60984,M:17.20506,S:0.07901},
      560:{L:-0.59218,M:17.09643,S:0.07987},588:{L:-0.57607,M:16.99724,S:0.08072},616:{L:-0.5614,M:16.90776,S:0.08156},
      644:{L:-0.54808,M:16.82806,S:0.08238},672:{L:-0.53601,M:16.75808,S:0.08318},700:{L:-0.52512,M:16.69758,S:0.08396},
      728:{L:-0.51534,M:16.64618,S:0.08471}
    },
    _whoWFLLMS: {
      // WHO boys weight-for-length LMS (recumbent length 45–110 cm, 2006 standards)
      45:{L:-0.3521,M:2.441,S:0.09182},46:{L:-0.3521,M:2.527,S:0.09041},
      47:{L:-0.3521,M:2.612,S:0.08913},48:{L:-0.3521,M:2.700,S:0.08800},
      49:{L:-0.3521,M:2.816,S:0.08721},50:{L:-0.3521,M:2.979,S:0.08600},
      51:{L:-0.3521,M:3.114,S:0.08545},52:{L:-0.3521,M:3.263,S:0.08499},
      53:{L:-0.3521,M:3.421,S:0.08449},54:{L:-0.3521,M:3.586,S:0.08391},
      55:{L:-0.3521,M:3.758,S:0.08328},56:{L:-0.3521,M:3.934,S:0.08280},
      57:{L:-0.3521,M:4.110,S:0.08255},58:{L:-0.3521,M:4.288,S:0.08237},
      59:{L:-0.3521,M:4.470,S:0.08219},60:{L:-0.3521,M:4.653,S:0.08201},
      61:{L:-0.3521,M:4.838,S:0.08191},62:{L:-0.3521,M:5.024,S:0.08183},
      63:{L:-0.3521,M:5.209,S:0.08180},64:{L:-0.3521,M:5.394,S:0.08177},
      65:{L:-0.3521,M:5.579,S:0.08175},66:{L:-0.3521,M:5.764,S:0.08178},
      67:{L:-0.3521,M:5.947,S:0.08188},68:{L:-0.3521,M:6.129,S:0.08200},
      69:{L:-0.3521,M:6.309,S:0.08214},70:{L:-0.3521,M:6.487,S:0.08228},
      71:{L:-0.3521,M:6.661,S:0.08244},72:{L:-0.3521,M:6.832,S:0.08261},
      73:{L:-0.3521,M:6.999,S:0.08278},74:{L:-0.3521,M:7.162,S:0.08297},
      75:{L:-0.3521,M:7.321,S:0.08316},76:{L:-0.3521,M:7.476,S:0.08337},
      77:{L:-0.3521,M:7.628,S:0.08359},78:{L:-0.3521,M:7.775,S:0.08384},
      79:{L:-0.3521,M:7.918,S:0.08410},80:{L:-0.3521,M:8.057,S:0.08436},
      81:{L:-0.3521,M:8.192,S:0.08464},82:{L:-0.3521,M:8.323,S:0.08491},
      83:{L:-0.3521,M:8.451,S:0.08519},84:{L:-0.3521,M:8.576,S:0.08546},
      85:{L:-0.3521,M:8.698,S:0.08573},86:{L:-0.3521,M:8.818,S:0.08600},
      87:{L:-0.3521,M:8.936,S:0.08629},88:{L:-0.3521,M:9.053,S:0.08659},
      89:{L:-0.3521,M:9.168,S:0.08690},90:{L:-0.3521,M:9.282,S:0.08721},
      91:{L:-0.3521,M:9.395,S:0.08752},92:{L:-0.3521,M:9.508,S:0.08783},
      93:{L:-0.3521,M:9.619,S:0.08815},94:{L:-0.3521,M:9.729,S:0.08847},
      95:{L:-0.3521,M:9.838,S:0.08879},96:{L:-0.3521,M:9.946,S:0.08912},
      97:{L:-0.3521,M:10.053,S:0.08944},98:{L:-0.3521,M:10.159,S:0.08977},
      99:{L:-0.3521,M:10.265,S:0.09011},100:{L:-0.3521,M:10.370,S:0.09045},
      101:{L:-0.3521,M:10.475,S:0.09079},102:{L:-0.3521,M:10.580,S:0.09114},
      103:{L:-0.3521,M:10.685,S:0.09149},104:{L:-0.3521,M:10.789,S:0.09184},
      105:{L:-0.3521,M:10.893,S:0.09219},106:{L:-0.3521,M:10.998,S:0.09254},
      107:{L:-0.3521,M:11.104,S:0.09290},108:{L:-0.3521,M:11.211,S:0.09327},
      109:{L:-0.3521,M:11.318,S:0.09364},110:{L:-0.3521,M:11.427,S:0.09401}
    },
    _getLMSForLength: function(lengthCm) {
      const table = this._whoWFLLMS;
      if (table[lengthCm]) return table[lengthCm];
      const keys = Object.keys(table).map(Number).sort(function(a,b){return a-b;});
      if (lengthCm <= keys[0])               return table[keys[0]];
      if (lengthCm >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
      let lo = keys[0], hi = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) {
        if (lengthCm >= keys[i] && lengthCm <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
      }
      const r = (lengthCm - lo) / (hi - lo);
      return { L: table[lo].L + (table[hi].L - table[lo].L) * r,
               M: table[lo].M + (table[hi].M - table[lo].M) * r,
               S: table[lo].S + (table[hi].S - table[lo].S) * r };
    },
    calculateZScoreWFL: function(lengthCm, weightKg) {
      const lms = this._getLMSForLength(lengthCm);
      if (!lms || !weightKg) return null;
      const { L, M, S } = lms;
      if (Math.abs(L) < 0.01) return Math.log(weightKg / M) / S;
      return (Math.pow(weightKg / M, L) - 1) / (L * S);
    },
    _getLMSForType: function(days, measurementType) {
      const tableMap = {
        weight: this._whoWeightLMS,
        length: this._whoLengthLMS,
        headCirc: this._whoHeadCircLMS,
        bmi: this._whoBmiLMS
      };
      const table = tableMap[measurementType] || this._whoWeightLMS;
      if (table[days]) return table[days];
      const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
      if (days <= ages[0]) return table[ages[0]];
      if (days >= ages[ages.length - 1]) return table[ages[ages.length - 1]];
      let lo = ages[0], hi = ages[ages.length - 1];
      for (let i = 0; i < ages.length - 1; i++) {
        if (days >= ages[i] && days <= ages[i + 1]) { lo = ages[i]; hi = ages[i + 1]; break; }
      }
      const r = (days - lo) / (hi - lo);
      return { L: table[lo].L + (table[hi].L - table[lo].L) * r,
               M: table[lo].M + (table[hi].M - table[lo].M) * r,
               S: table[lo].S + (table[hi].S - table[lo].S) * r };
    },
    _getLMS: function(days) {
      return this._getLMSForType(days, 'weight');
    },
    calculateZScore: function(ageInDays, measurement, measurementType) {
      const lms = this._getLMSForType(ageInDays, measurementType || 'weight');
      if (!lms || !measurement) return null;
      const { L, M, S } = lms;
      return Math.abs(L) < 0.01
        ? Math.log(measurement / M) / S
        : (Math.pow(measurement / M, L) - 1) / (L * S);
    },
    zScoreToPercentile: function(zScore) {
      const erf = (x) => {
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        const t = 1 / (1 + p * x);
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
      };
      return 50 * (1 + erf(zScore / Math.sqrt(2)));
    }
  };
}

function loadAllData() {
  let dailyData = parseCSV(fs.readFileSync(CONFIG.dataPath, 'utf8'));
  const sessionsData = parseCSV(fs.readFileSync(CONFIG.sessionsPath, 'utf8'));
  const babyConfig = loadBabyConfig();

  let medicalContext = '';
  if (fs.existsSync(CONFIG.medicalContextPath)) {
    medicalContext = fs.readFileSync(CONFIG.medicalContextPath, 'utf8');
  }

  // Prepend birth measurement and earlyWeightEntries from config so growth
  // metrics (birthWeight, velocity from birth, allMeasurements) are accurate.
  const existingDates = new Set(dailyData.map(d => d.date));
  const birthEntry = {
    date: babyConfig.birthDateString,
    weight: babyConfig.birthMeasurements.weight || null,
    height: babyConfig.birthMeasurements.length || null,
    headCirc: babyConfig.birthMeasurements.headCirc || null,
    pumpLeft: 0, pumpRight: 0, expr: 0, form: 0
  };
  const earlyEntries = (babyConfig.earlyWeightEntries || [])
    .filter(e => !existingDates.has(e.date) && e.date !== babyConfig.birthDateString)
    .map(e => ({
      date: e.date,
      weight: e.weight || null,
      height: e.height || null,
      headCirc: e.headCirc || null,
      pumpLeft: 0, pumpRight: 0, expr: 0, form: 0
    }));

  if (!existingDates.has(babyConfig.birthDateString)) {
    dailyData = [birthEntry, ...earlyEntries, ...dailyData];
  } else {
    dailyData = [...earlyEntries, ...dailyData];
  }

  // Sort chronologically
  dailyData.sort((a, b) => {
    const pa = a.date.split('/'); const pb = b.date.split('/');
    const da = new Date(parseInt(pa[2]), parseInt(pa[1])-1, parseInt(pa[0]));
    const db = new Date(parseInt(pb[2]), parseInt(pb[1])-1, parseInt(pb[0]));
    return da - db;
  });

  return { dailyData, sessionsData, babyConfig, medicalContext };
}

function parseDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function getDaysFromBirth(dateStr, birthDate) {
  const date = parseDate(dateStr);
  if (!date) return 0;
  return Math.floor((date - birthDate) / (1000 * 60 * 60 * 24));
}

function calculateStdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate trend acceleration - rate of change of production growth
 */
function calculateTrendAcceleration(dailyData) {
  const windowSize = 7;

  if (dailyData.length < windowSize * 3) {
    return {
      status: 'insufficient_data',
      current: null
    };
  }

  // Calculate velocities (week-over-week changes)
  const velocities = [];
  for (let i = windowSize; i < dailyData.length; i++) {
    const currentWeek = dailyData.slice(i - windowSize, i);
    const previousWeek = dailyData.slice(i - windowSize * 2, i - windowSize);

    const currentAvg = currentWeek.reduce((sum, d) => sum + ((d.pumpLeft || 0) + (d.pumpRight || 0)), 0) / windowSize;
    const previousAvg = previousWeek.reduce((sum, d) => sum + ((d.pumpLeft || 0) + (d.pumpRight || 0)), 0) / windowSize;

    velocities.push({
      date: dailyData[i].date,
      velocity: currentAvg - previousAvg
    });
  }

  // Calculate accelerations (change in velocity)
  const accelerations = [];
  for (let i = 1; i < velocities.length; i++) {
    accelerations.push({
      date: velocities[i].date,
      value: velocities[i].velocity - velocities[i - 1].velocity
    });
  }

  if (accelerations.length === 0) {
    return { status: 'insufficient_data', current: null };
  }

  // Recent acceleration (last 3 points)
  const recentAccel = accelerations.slice(-3);
  const avgAcceleration = recentAccel.reduce((sum, a) => sum + a.value, 0) / recentAccel.length;

  return {
    current: avgAcceleration.toFixed(2),
    recentVelocities: velocities.slice(-7).map(v => `${v.date}: ${v.velocity.toFixed(1)} ml/week`),
    recentAccelerations: accelerations.slice(-7).map(a => `${a.date}: ${a.value.toFixed(1)} ml/week^2`)
  };
}

/**
 * Calculate recovery rate from production drops
 */
function calculateRecoveryRate(dailyData) {
  if (dailyData.length < 14) {
    return {
      status: 'insufficient_data',
      drops: []
    };
  }

  // Calculate rolling 7-day baseline; deduplicate consecutive drop days into single events
  const drops = [];
  let inDrop = false;
  for (let i = 7; i < dailyData.length; i++) {
    const baseline = dailyData.slice(i - 7, i)
      .reduce((sum, d) => sum + ((d.pumpLeft || 0) + (d.pumpRight || 0)), 0) / 7;

    const currentProduction = (dailyData[i].pumpLeft || 0) + (dailyData[i].pumpRight || 0);
    const dropPercent = baseline > 0 ? ((baseline - currentProduction) / baseline) * 100 : 0;

    if (dropPercent > 20 && currentProduction > 0) {
      if (!inDrop) {
        inDrop = true;
        // Find recovery point from this first drop day
        let recoveryDays = null;
        for (let j = i + 1; j < dailyData.length; j++) {
          const futureProduction = (dailyData[j].pumpLeft || 0) + (dailyData[j].pumpRight || 0);
          if (futureProduction >= baseline * 0.95) {
            recoveryDays = j - i;
            break;
          }
        }
        drops.push({
          date: dailyData[i].date,
          baseline: Math.round(baseline),
          actual: Math.round(currentProduction),
          dropPercent: dropPercent.toFixed(1),
          recoveryDays: recoveryDays,
          recovered: recoveryDays !== null
        });
      }
    } else {
      inDrop = false;
    }
  }

  if (drops.length === 0) {
    return {
      drops: [],
      totalDrops: 0,
      recoveredDrops: 0,
      averageRecoveryDays: null
    };
  }

  const recoveredDrops = drops.filter(d => d.recovered);
  const avgRecovery = recoveredDrops.length > 0
    ? (recoveredDrops.reduce((sum, d) => sum + d.recoveryDays, 0) / recoveredDrops.length).toFixed(1)
    : null;

  return {
    drops: drops,
    totalDrops: drops.length,
    recoveredDrops: recoveredDrops.length,
    averageRecoveryDays: avgRecovery
  };
}

/**
 * Analyze hunger patterns from consumption data
 */
function analyzeHungerPattern(dailyData) {
  if (dailyData.length < 7) {
    return { status: 'insufficient_data' };
  }

  const consumptionData = dailyData.map(d => ({
    date: d.date,
    total: (d.expr || 0) + (d.form || 0),
    expr:  (d.expr  || 0),
    form:  (d.form  || 0),
  }));

  // -- 7-day rolling average ---------------------------------------------
  const rolling = [];
  for (let i = 0; i < consumptionData.length; i++) {
    if (i < 6) { rolling.push(null); continue; }
    const win = consumptionData.slice(i - 6, i + 1);
    rolling.push(Math.round(win.reduce((s, d) => s + d.total, 0) / 7));
  }

  // -- Helper: convert DD/MM/YYYY → ISO for string comparison ----------
  function toISO(d) { const p = d.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; }

  // -- Detect consumption eras via change-point detection --------------
  //
  // A new era begins when the 7-day rolling avg has moved >80ml from the
  // current era's running average AND stays moved for >5 consecutive days.
  // This captures genuine demand shifts (e.g. growth spurts, the Jan 2026
  // drop/surge) without being fooled by single-day spikes.
  //
  // After raw era detection: absorb eras < 14 days into their neighbour
  // (unless it is the last era), then collapse adjacent same-level eras.

  const CHANGE_THRESHOLD = 80;   // ml — minimum shift to call a new era
  const SUSTAIN_DAYS     = 5;    // consecutive days the shift must hold

  const rawEras = [];
  let eraStart    = 6;                       // index of current era's first rolling day
  let eraRunSum   = rolling[6];
  let eraRunCount = 1;
  let pendingBreak = 0;                      // how many consecutive days outside threshold

  for (let i = 7; i < consumptionData.length; i++) {
    const rv = rolling[i];
    if (rv === null) continue;
    const eraAvg = eraRunSum / eraRunCount;
    if (Math.abs(rv - eraAvg) > CHANGE_THRESHOLD) {
      pendingBreak++;
      if (pendingBreak >= SUSTAIN_DAYS) {
        // Commit the era that just ended (backdate to where the shift started)
        const eraEndIdx = i - SUSTAIN_DAYS;
        rawEras.push({
          startDate: consumptionData[eraStart].date,
          endDate:   consumptionData[eraEndIdx].date,
          dayCount:  eraEndIdx - eraStart + 1,
        });
        eraStart     = eraEndIdx + 1;
        eraRunSum    = rolling.slice(eraStart, i + 1).filter(v => v !== null).reduce((s, v) => s + v, 0);
        eraRunCount  = i - eraStart + 1;
        pendingBreak = 0;
      }
      // Don't add the pending days to the running avg — they're "undecided"
    } else {
      pendingBreak = 0;
      eraRunSum   += rv;
      eraRunCount++;
    }
  }
  // Push the final era
  rawEras.push({
    startDate: consumptionData[eraStart].date,
    endDate:   consumptionData[consumptionData.length - 1].date,
    dayCount:  consumptionData.length - eraStart,
  });

  function collapseAdj(list) {
    // Two eras are "same level" if their avg consumption is within 60ml of each other.
    // Use a day-count weighted average so a 30-day era is not given equal weight to a 5-day era.
    const out = [];
    for (const e of list) {
      const p = out[out.length - 1];
      if (p && Math.abs((p.avgConsumption || 0) - (e.avgConsumption || 0)) <= 60) {
        const totalDays = p.dayCount + e.dayCount;
        p.avgConsumption = totalDays > 0
          ? Math.round(((p.avgConsumption || 0) * p.dayCount + (e.avgConsumption || 0) * e.dayCount) / totalDays)
          : 0;
        p.endDate  = e.endDate;
        p.dayCount = totalDays;
      } else {
        out.push({ ...e });
      }
    }
    return out;
  }

  // First compute avg per raw era so collapseAdj can compare levels
  rawEras.forEach(era => {
    const slice = consumptionData.filter(d => {
      const iso = toISO(d.date);
      return iso >= toISO(era.startDate) && iso <= toISO(era.endDate) && d.total > 0;
    });
    era.avgConsumption = slice.length > 0 ? Math.round(slice.reduce((s,d)=>s+d.total,0)/slice.length) : 0;
  });

  // Absorb short eras (<14 days) into neighbour, protect last era
  const MIN_ERA = 14;
  const afterB = [];
  for (let i = 0; i < rawEras.length; i++) {
    const e = rawEras[i], isLast = i === rawEras.length - 1, prev = afterB[afterB.length - 1];
    if (!isLast && e.dayCount < MIN_ERA && prev) { prev.endDate = e.endDate; prev.dayCount += e.dayCount; }
    else afterB.push({ ...e });
  }

  // Recompute avg after absorption, then collapse same-level adjacents
  afterB.forEach(era => {
    const slice = consumptionData.filter(d => {
      const iso = toISO(d.date);
      return iso >= toISO(era.startDate) && iso <= toISO(era.endDate) && d.total > 0;
    });
    era.avgConsumption = slice.length > 0 ? Math.round(slice.reduce((s,d)=>s+d.total,0)/slice.length) : 0;
  });
  const eras = collapseAdj(afterB);

  // -- Compute actual avg consumption per era ----------------------------
  eras.forEach(era => {
    const slice = consumptionData.filter(d => {
      const iso = toISO(d.date);
      return iso >= toISO(era.startDate) && iso <= toISO(era.endDate) && d.total > 0;
    });
    era.avgConsumption = slice.length > 0 ? Math.round(slice.reduce((s,d)=>s+d.total,0)/slice.length) : 0;
    era.avgExpr = slice.length > 0 ? Math.round(slice.reduce((s,d)=>s+d.expr,0)/slice.length) : 0;
    era.avgForm = slice.length > 0 ? Math.round(slice.reduce((s,d)=>s+d.form,0)/slice.length) : 0;
  });

  // -- Transitions: delta between consecutive eras -----------------------
  const transitions = [];
  for (let i = 1; i < eras.length; i++) {
    const prev = eras[i - 1], curr = eras[i];
    const delta = curr.avgConsumption - prev.avgConsumption;
    const pct   = prev.avgConsumption > 0 ? ((delta / prev.avgConsumption) * 100).toFixed(0) : '0';
    transitions.push({
      transitionDate: curr.startDate,
      fromAvg: prev.avgConsumption,
      toAvg:   curr.avgConsumption,
      delta,
      pct: +pct,
      direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'stable',
      magnitude: Math.abs(+pct) >= 30 ? 'major' : Math.abs(+pct) >= 15 ? 'moderate' : 'minor',
    });
  }

  // -- Current / recent stats --------------------------------------------
  const recent14 = consumptionData.slice(-14);
  const recentAvg  = Math.round(recent14.reduce((s,d)=>s+d.total,0) / recent14.length);
  const recentMax  = Math.max(...recent14.map(d=>d.total));
  const recentMin  = Math.min(...recent14.map(d=>d.total));
  const firstWeekAvg = consumptionData.slice(0,7).reduce((s,d)=>s+d.total,0) / 7;
  const lastWeekAvg  = recent14.slice(-7).reduce((s,d)=>s+d.total,0) / 7;
  const growthRate = firstWeekAvg > 0 ? ((lastWeekAvg - firstWeekAvg) / firstWeekAvg * 100) : 0;

  const allTotals = consumptionData.map(d=>d.total);
  const mean = allTotals.reduce((s,v)=>s+v,0) / allTotals.length;
  const stdDev = Math.sqrt(allTotals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/allTotals.length);
  const cv = mean > 0 ? (stdDev/mean*100) : 0;

  let predictability;
  if (cv < 10) predictability = 'highly_predictable';
  else if (cv < 20) predictability = 'moderately_predictable';
  else if (cv < 30) predictability = 'somewhat_variable';
  else predictability = 'highly_variable';

  return {
    currentAverage: recentAvg,
    recentRange: `${Math.round(recentMin)} – ${Math.round(recentMax)} ml`,
    growthRate: growthRate.toFixed(1),
    predictability,
    coefficientOfVariation: cv.toFixed(1),
    trend: growthRate > 5 ? 'increasing' : growthRate < -5 ? 'decreasing' : 'stable',
    eras,
    transitions,
  };
}

/**
 * Analyze weight gain patterns with detailed velocity changes
 */
function analyzeWeightGainPatterns(dailyData, babyConfig) {
  const weightMeasurements = dailyData
    .filter(d => d.weight)
    .map(d => ({
      date: d.date,
      weight: d.weight,
      days: getDaysFromBirth(d.date, babyConfig.birthDate)
    }))
    .sort((a, b) => a.days - b.days);

  if (weightMeasurements.length < 3) {
    return {
      status: 'insufficient_data'
    };
  }

  // Calculate interval velocities
  const velocities = [];
  for (let i = 1; i < weightMeasurements.length; i++) {
    const prev = weightMeasurements[i - 1];
    const curr = weightMeasurements[i];
    const daysDiff = curr.days - prev.days;
    const weightGainG = (curr.weight - prev.weight) * 1000;
    const gPerDay = weightGainG / daysDiff;
    const gPerWeek = gPerDay * 7;

    const whoRange = babyConfig.getWHOVelocityRange(curr.days);
    const adequacy = gPerWeek >= whoRange.min && gPerWeek <= whoRange.max ? 'adequate' :
                     gPerWeek > whoRange.max ? 'above_range' : 'below_range';

    velocities.push({
      fromDate: prev.date,
      toDate: curr.date,
      fromDays: prev.days,
      toDays: curr.days,
      interval: daysDiff,
      gPerDay: gPerDay.toFixed(1),
      gPerWeek: gPerWeek.toFixed(0),
      adequacy: adequacy,
      whoRange: `${whoRange.min}-${whoRange.max} g/week`
    });
  }

  // Calculate ACCELERATION (change in velocity between consecutive intervals)
  const accelerations = [];
  for (let i = 1; i < velocities.length; i++) {
    const prevVelocity = parseFloat(velocities[i - 1].gPerWeek);
    const currVelocity = parseFloat(velocities[i].gPerWeek);
    const accel = currVelocity - prevVelocity;

    // Determine if acceleration is within normal physiological range
    // Typical deceleration in first year: ~5-10 g/week decrease per interval
    let accelStatus;
    if (Math.abs(accel) < 10) {
      accelStatus = 'normal';
    } else if (accel > 20) {
      accelStatus = 'rapid_acceleration';
    } else if (accel < -20) {
      accelStatus = 'rapid_deceleration';
    } else {
      accelStatus = 'moderate_change';
    }

    accelerations.push({
      period: `${velocities[i].fromDate} to ${velocities[i].toDate}`,
      fromVelocity: velocities[i - 1].gPerWeek,
      toVelocity: velocities[i].gPerWeek,
      acceleration: accel.toFixed(0),
      status: accelStatus
    });
  }

  // Detect pattern changes
  const patterns = [];
  for (let i = 1; i < velocities.length; i++) {
    const prev = parseFloat(velocities[i - 1].gPerWeek);
    const curr = parseFloat(velocities[i].gPerWeek);
    const change = curr - prev;
    const changePercent = prev > 0 ? (change / prev) * 100 : 0;

    if (Math.abs(changePercent) > 20) {
      patterns.push({
        period: `${velocities[i].fromDate} to ${velocities[i].toDate}`,
        change: change.toFixed(0),
        changePercent: changePercent.toFixed(1),
        type: change > 0 ? 'acceleration' : 'deceleration'
      });
    }
  }

  // Current trend
  const recentVelocities = velocities.slice(-2);
  const currentTrend = recentVelocities.length === 2
    ? (parseFloat(recentVelocities[1].gPerWeek) > parseFloat(recentVelocities[0].gPerWeek) ? 'increasing' : 'decreasing')
    : 'stable';

  // Overall acceleration trend (last 3 accelerations if available)
  let overallAccelTrend = 'stable';
  if (accelerations.length >= 3) {
    const recentAccels = accelerations.slice(-3);
    const avgAccel = recentAccels.reduce((sum, a) => sum + parseFloat(a.acceleration), 0) / recentAccels.length;
    if (avgAccel > 5) {
      overallAccelTrend = 'accelerating';
    } else if (avgAccel < -5) {
      overallAccelTrend = 'decelerating';
    }
  }

  return {
    totalMeasurements: weightMeasurements.length,
    allVelocities: velocities,
    allAccelerations: accelerations,
    patterns: patterns,
    currentTrend: currentTrend,
    overallAccelTrend: overallAccelTrend,
    latestVelocity: velocities[velocities.length - 1],
    latestAcceleration: accelerations.length > 0 ? accelerations[accelerations.length - 1] : null,
    adequacyStatus: velocities[velocities.length - 1].adequacy
  };
}

/**
 * Analyze left/right breast asymmetry in detail
 */
/**
 * Calculate WHO Weight-for-Length metrics for all paired weight+length measurements.
 */
function calculateWFLMetrics(dailyData, babyConfig) {
  function parseDate(dateStr) {
    const p = dateStr.split('/');
    if (p.length !== 3) return null;
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  }

  const earlyDates = new Set((babyConfig.earlyWeightEntries || []).map(e => e.date));
  const allRows = [
    ...(babyConfig.earlyWeightEntries || []).map(e => ({
      date: e.date,
      weight: e.weight || null,
      height: e.height || null
    })),
    ...dailyData.filter(d => !earlyDates.has(d.date)).map(d => ({
      date: d.date,
      weight: typeof d.weight === 'number' ? d.weight : null,
      height: typeof d.height === 'number' ? d.height : null
    }))
  ].filter(r => r.weight && r.height);

  allRows.sort((a, b) => {
    const pa = a.date.split('/'), pb = b.date.split('/');
    return new Date(parseInt(pa[2]), parseInt(pa[1])-1, parseInt(pa[0]))
         - new Date(parseInt(pb[2]), parseInt(pb[1])-1, parseInt(pb[0]));
  });

  if (allRows.length === 0) return { status: 'insufficient_data', measurementCount: 0 };

  const measurements = allRows.map(r => {
    const z = babyConfig.calculateZScoreWFL(r.height, r.weight);
    const pct = z !== null ? babyConfig.zScoreToPercentile(z) : null;
    const lms = babyConfig._getLMSForLength(r.height);
    const who50 = lms ? lms.M : null;
    return {
      date:       r.date,
      length:     r.height,
      weight:     r.weight,
      who50:      who50,
      zScore:     z !== null ? parseFloat(z.toFixed(2)) : null,
      percentile: pct !== null ? parseFloat(pct.toFixed(1)) : null
    };
  });

  const current = measurements[measurements.length - 1];
  const first   = measurements[0];

  const totalZChange = (current.zScore !== null && first.zScore !== null)
    ? parseFloat((current.zScore - first.zScore).toFixed(2)) : null;

  const changes = [];
  for (let i = 1; i < measurements.length; i++) {
    const prev = measurements[i - 1], curr = measurements[i];
    const dz = (curr.zScore !== null && prev.zScore !== null)
      ? parseFloat((curr.zScore - prev.zScore).toFixed(2)) : null;
    changes.push({
      fromDate:   prev.date,
      toDate:     curr.date,
      fromLength: prev.length,
      toLength:   curr.length,
      fromZ:      prev.zScore,
      toZ:        curr.zScore,
      deltaZ:     dz,
      direction:  dz !== null ? (dz > 0.1 ? 'improving' : dz < -0.1 ? 'declining' : 'stable') : 'unknown'
    });
  }

  // WHO clinical categories for WFL
  const cz = current.zScore;
  let category;
  if (cz === null)   category = 'unknown';
  else if (cz < -3)  category = 'severely_wasted';
  else if (cz < -2)  category = 'wasted';
  else if (cz < -1)  category = 'at_risk_of_wasting';
  else if (cz <= 1)  category = 'normal';
  else if (cz <= 2)  category = 'possible_overweight';
  else if (cz <= 3)  category = 'overweight';
  else               category = 'obese';

  let overallDirection = 'stable';
  if (totalZChange !== null) {
    if (totalZChange > 0.3)       overallDirection = 'improving';
    else if (totalZChange < -0.3) overallDirection = 'declining';
  }

  return {
    allMeasurements:   measurements,
    changes,
    currentLength:     current.length,
    currentWeight:     current.weight,
    currentZScore:     current.zScore,
    currentPercentile: current.percentile,
    currentWho50:      current.who50,
    firstZScore:       first.zScore,
    totalZChange,
    overallDirection,
    category,
    measurementCount:  measurements.length
  };
}

function analyzeBreastAsymmetry(dailyData) {
  if (dailyData.length < 7) {
    return {
      status: 'insufficient_data'
    };
  }

  const daysWithData = dailyData.filter(d => (d.pumpLeft || 0) > 0 || (d.pumpRight || 0) > 0);

  if (daysWithData.length < 7) {
    return {
      status: 'insufficient_data'
    };
  }

  // Calculate overall asymmetry
  const totalLeft = daysWithData.reduce((sum, d) => sum + (d.pumpLeft || 0), 0);
  const totalRight = daysWithData.reduce((sum, d) => sum + (d.pumpRight || 0), 0);
  const overallRatio = totalRight > 0 ? totalLeft / totalRight : 0;
  const dominant = totalLeft > totalRight ? 'left' : 'right';
  const asymmetryPercent = Math.abs(totalLeft - totalRight) / Math.max(totalLeft, totalRight) * 100;

  // Trend analysis: first week vs last week
  const firstWeek = daysWithData.slice(0, Math.min(7, daysWithData.length));
  const lastWeek = daysWithData.slice(-Math.min(7, daysWithData.length));

  const firstWeekLeft = firstWeek.reduce((sum, d) => sum + (d.pumpLeft || 0), 0) / firstWeek.length;
  const firstWeekRight = firstWeek.reduce((sum, d) => sum + (d.pumpRight || 0), 0) / firstWeek.length;
  const lastWeekLeft = lastWeek.reduce((sum, d) => sum + (d.pumpLeft || 0), 0) / lastWeek.length;
  const lastWeekRight = lastWeek.reduce((sum, d) => sum + (d.pumpRight || 0), 0) / lastWeek.length;

  const firstWeekAsymmetry = Math.abs(firstWeekLeft - firstWeekRight) / Math.max(firstWeekLeft, firstWeekRight) * 100;
  const lastWeekAsymmetry = Math.abs(lastWeekLeft - lastWeekRight) / Math.max(lastWeekLeft, lastWeekRight) * 100;
  const asymmetryTrend = lastWeekAsymmetry - firstWeekAsymmetry;

  // Consistency analysis: how stable is the asymmetry?
  const dailyRatios = daysWithData.map(d => {
    const left = d.pumpLeft || 0;
    const right = d.pumpRight || 0;
    if (right === 0) return null;
    return left / right;
  }).filter(r => r !== null);

  const avgRatio = dailyRatios.reduce((sum, r) => sum + r, 0) / dailyRatios.length;
  const ratioStdDev = Math.sqrt(
    dailyRatios.reduce((sum, r) => sum + Math.pow(r - avgRatio, 2), 0) / dailyRatios.length
  );
  const coefficientOfVariation = (ratioStdDev / avgRatio) * 100;

  // Detailed daily breakdown
  const recentDays = daysWithData.slice(-14).map(d => ({
    date: d.date,
    left: d.pumpLeft || 0,
    right: d.pumpRight || 0,
    difference: Math.abs((d.pumpLeft || 0) - (d.pumpRight || 0)),
    dominant: (d.pumpLeft || 0) > (d.pumpRight || 0) ? 'left' : 'right'
  }));

  // Consistency categorization
  let consistency;
  if (coefficientOfVariation < 10) {
    consistency = 'highly_consistent';
  } else if (coefficientOfVariation < 20) {
    consistency = 'moderately_consistent';
  } else if (coefficientOfVariation < 30) {
    consistency = 'somewhat_variable';
  } else {
    consistency = 'highly_variable';
  }

  return {
    overallRatio: overallRatio.toFixed(2),
    dominant: dominant,
    asymmetryPercent: asymmetryPercent.toFixed(1),
    totalLeft: Math.round(totalLeft),
    totalRight: Math.round(totalRight),
    difference: Math.round(Math.abs(totalLeft - totalRight)),

    firstWeekAvg: {
      left: Math.round(firstWeekLeft),
      right: Math.round(firstWeekRight),
      asymmetry: firstWeekAsymmetry.toFixed(1)
    },

    lastWeekAvg: {
      left: Math.round(lastWeekLeft),
      right: Math.round(lastWeekRight),
      asymmetry: lastWeekAsymmetry.toFixed(1)
    },

    asymmetryTrend: asymmetryTrend.toFixed(1),
    trendDirection: asymmetryTrend > 5 ? 'increasing' : asymmetryTrend < -5 ? 'decreasing' : 'stable',

    consistency: consistency,
    coefficientOfVariation: coefficientOfVariation.toFixed(1),

    recentDays: recentDays
  };
}

/**
 * Analyze day-of-week production AND consumption rhythm.
 *
 * Returns per-day averages for all 7 days (all-time and recent-28-day views),
 * plus peak/trough summaries for both production and consumption.
 *
 * Key insight: production varies because of maternal rest/stress cycles;
 * consumption is driven by baby hunger — comparing the two reveals which
 * days have genuine supply-demand mismatches.
 */
function analyzeDayOfWeekRhythm(dailyData) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function buildStats(rows) {
    const stats = {};
    dayNames.forEach(function(d) {
      stats[d] = { prodSum: 0, consumeSum: 0, formSum: 0, count: 0 };
    });
    rows.forEach(function(d) {
      const dt = parseDate(d.date);
      if (!dt) return;
      const dow = dayNames[dt.getDay()];
      const prod    = (parseFloat(d.pumpLeft)  || 0) + (parseFloat(d.pumpRight) || 0);
      const consume = (parseFloat(d.expr)       || 0) + (parseFloat(d.form)      || 0);
      const form    =  parseFloat(d.form)       || 0;
      stats[dow].prodSum    += prod;
      stats[dow].consumeSum += consume;
      stats[dow].formSum    += form;
      stats[dow].count++;
    });
    return dayNames.map(function(name) {
      const s = stats[name];
      const avgProd    = s.count > 0 ? Math.round(s.prodSum    / s.count) : 0;
      const avgConsume = s.count > 0 ? Math.round(s.consumeSum / s.count) : 0;
      const avgForm    = s.count > 0 ? Math.round(s.formSum    / s.count) : 0;
      return {
        day:            name,
        avgProduction:  avgProd,
        avgConsumption: avgConsume,
        avgFormula:     avgForm,
        gap:            avgProd - avgConsume,   // positive = surplus, negative = deficit
        count:          s.count
      };
    });
  }

  const allTime  = buildStats(dailyData);
  const recent28 = buildStats(dailyData.slice(-28));

  // Summaries over days that have data
  const valid = allTime.filter(function(d) { return d.count > 0; });

  const peakProd    = valid.reduce(function(a, b) { return a.avgProduction  > b.avgProduction  ? a : b; });
  const troughProd  = valid.reduce(function(a, b) { return a.avgProduction  < b.avgProduction  ? a : b; });
  const peakCons    = valid.reduce(function(a, b) { return a.avgConsumption > b.avgConsumption ? a : b; });
  const troughCons  = valid.reduce(function(a, b) { return a.avgConsumption < b.avgConsumption ? a : b; });
  const bestGap     = valid.reduce(function(a, b) { return a.gap > b.gap ? a : b; });
  const worstGap    = valid.reduce(function(a, b) { return a.gap < b.gap ? a : b; });

  const prodRange = peakProd.avgProduction - troughProd.avgProduction;
  const avgProdAll = valid.reduce(function(s, d) { return s + d.avgProduction; }, 0) / valid.length;
  const prodVariationPct = avgProdAll > 0
    ? (prodRange / avgProdAll * 100).toFixed(1)
    : '0';

  // Detect whether consumption tracks production (correlation-like check)
  // Simple: rank days by production, check if consumption ranking agrees
  const sortedByProd = valid.slice().sort(function(a, b) { return b.avgProduction - a.avgProduction; });
  const prodRanks    = {};
  sortedByProd.forEach(function(d, i) { prodRanks[d.day] = i; });
  const sortedByCons = valid.slice().sort(function(a, b) { return b.avgConsumption - a.avgConsumption; });
  const consRanks    = {};
  sortedByCons.forEach(function(d, i) { consRanks[d.day] = i; });
  // Spearman rank difference
  const rankDiffSq = valid.reduce(function(s, d) {
    return s + Math.pow(prodRanks[d.day] - consRanks[d.day], 2);
  }, 0);
  const n = valid.length;
  const spearman = n > 1 ? (1 - (6 * rankDiffSq) / (n * (n * n - 1))).toFixed(2) : '0';
  const trackingLabel = parseFloat(spearman) > 0.5  ? 'tracks_production'
                      : parseFloat(spearman) < -0.2 ? 'inversely_tracks'
                      :                               'independent';

  return {
    allTime:  allTime,
    recent28: recent28,

    peakProductionDay:    peakProd.day,
    peakProductionValue:  peakProd.avgProduction,
    troughProductionDay:  troughProd.day,
    troughProductionValue: troughProd.avgProduction,
    productionRangeMl:    prodRange,
    productionVariationPct: prodVariationPct,

    peakConsumptionDay:   peakCons.day,
    peakConsumptionValue: peakCons.avgConsumption,
    troughConsumptionDay: troughCons.day,
    troughConsumptionValue: troughCons.avgConsumption,

    bestSurplusDay:   bestGap.day,
    bestSurplusValue: bestGap.gap,
    worstGapDay:      worstGap.day,
    worstGapValue:    worstGap.gap,

    consumptionTracksProduction: trackingLabel,
    spearmanRankCorrelation:     spearman
  };
}

// parseTimeToHour is defined below alongside the canonical slot helpers.

/**
 * Format a fractional hour as a readable time string (e.g. 14.5 -> "2:30 PM").
 */
function formatHour(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  let adjHH = hh;
  if (mm === 60) { mm = 0; adjHH = (adjHH + 1) % 24; }
  const period = adjHH < 12 ? 'AM' : 'PM';
  const display = adjHH % 12 === 0 ? 12 : adjHH % 12;
  return `${display}:${mm.toString().padStart(2, '0')} ${period}`;
}

// ------------------------------------------------------------
// CANONICAL SLOT RESOLUTION
//
// Pumping sessions drift slightly from their nominal 3-hour anchor over time
// (e.g. the 12 AM session gets recorded at 1 AM). resolveSlot() always returns
// a canonical slot label using a two-stage approach:
//   1. If s.timeSlot is already one of the 8 known anchors → use it directly.
//   2. Otherwise parse s.pumpTime (actual clock time) and fuzzy-map it to the
//      nearest 3-hour anchor (catchment ±1.5 h, circular).
// This means sessions are NEVER silently dropped just because the slot drifted.
// ------------------------------------------------------------

const CANONICAL_SLOT_ANCHORS = [
  { hour:  0, label: '12:00 AM' },
  { hour:  3, label:  '3:00 AM' },
  { hour:  6, label:  '6:00 AM' },
  { hour:  9, label:  '9:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 15, label:  '3:00 PM' },
  { hour: 18, label:  '6:00 PM' },
  { hour: 21, label:  '9:00 PM' },
];

const CANONICAL_SLOT_SET = new Set(CANONICAL_SLOT_ANCHORS.map(function(a) { return a.label; }));

const CANONICAL_SLOT_HOUR = CANONICAL_SLOT_ANCHORS.reduce(function(acc, a) {
  acc[a.label] = a.hour;
  return acc;
}, {});

/**
 * Parse a "H:MM AM/PM" string to a fractional hour (0–23.99).
 * Returns null if unparseable.
 */
function parseTimeToHour(timeStr) {
  if (!timeStr || timeStr === '❌' || timeStr === 'null' || !timeStr.trim()) return null;
  var m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  var ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h + min / 60;
}

/**
 * Map any hour (0–23.99) to the label of the nearest 3-hour canonical anchor.
 */
function hourToNearestCanonicalSlot(h) {
  var best = null, bestDist = Infinity;
  CANONICAL_SLOT_ANCHORS.forEach(function(a) {
    var dist = Math.min(Math.abs(h - a.hour), 24 - Math.abs(h - a.hour));
    if (dist < bestDist) { bestDist = dist; best = a.label; }
  });
  return best;
}

/**
 * Resolve the canonical 3-hour slot label for a session record.
 *
 * Priority:
 *   1. s.timeSlot is an exact known anchor  → use it
 *   2. s.pumpTime is a parseable time string → fuzzy-map to nearest anchor
 *   3. s.timeSlot exists but isn't a known anchor (e.g. "1:00 AM" stored as
 *      a label) → try to parse it as a time string and fuzzy-map
 *   4. None of the above → return null (session is genuinely unclassifiable)
 */
function resolveSlot(session) {
  // Stage 1: exact canonical match
  if (session.timeSlot && CANONICAL_SLOT_SET.has(session.timeSlot)) {
    return session.timeSlot;
  }

  // Stage 2: fuzzy from actual pump time
  if (session.pumpTime) {
    var h = parseTimeToHour(session.pumpTime);
    if (h !== null) return hourToNearestCanonicalSlot(h);
  }

  // Stage 3: timeSlot itself might be a non-canonical time string (e.g. "1:00 AM")
  if (session.timeSlot) {
    var h2 = parseTimeToHour(session.timeSlot);
    if (h2 !== null) return hourToNearestCanonicalSlot(h2);
  }

  return null;  // genuinely unclassifiable
}

// ------------------------------------------------------------
// KDE-BASED CANONICAL SESSION DETECTION
//
// Philosophy
// ----------
// Pumping schedules evolve deliberately: 8 sessions/day → 7 → 6, with each
// slot potentially drifting ±1 hour night-to-night (e.g. the "12 AM" pump
// lands anywhere between 11:30 PM and 1:30 AM).
//
// Two problems the old greedy-window approach could not solve:
//   1. A 45-minute window sometimes SPLITS the same slot when drift is large.
//   2. It cannot distinguish "same slot, different night" from "genuinely
//      separate slot close by", because it has no concept of density.
//
// Algorithm
// ----------
// Step 1 – KDE on the circular 24-hour axis.
//   Build a density curve by placing a Gaussian kernel (σ = 0.75 h) at every
//   observed pump time, WEIGHTED by that session's pump output (ml).  High-
//   output sessions contribute more to the peak than low/skipped ones.
//   The density is evaluated at 96 evenly-spaced points (every 15 min).
//   Using output-weighting means a true slot that produces 80 ml registers
//   far more strongly than a stray 5 ml bleed-over.
//
// Step 2 – Peak detection.
//   Find all local maxima in the density curve.  Keep only peaks whose
//   density ≥ MIN_PEAK_RATIO × global maximum (filters pure noise).
//
// Step 3 – Merge close peaks.
//   Two peaks closer than MIN_SLOT_GAP hours (1.75 h) on the circular axis
//   represent the same slot drifting, NOT two distinct slots.  Merge them:
//   the survivor's centre = output-weighted mean of both peaks' times.
//   Repeat until no mergeable pair remains.
//
// Step 4 – Assign sessions to surviving peaks.
//   Each pump session is assigned to its nearest peak (circular distance).
//   A session is claimed by a peak only if its distance ≤ half the gap to the
//   next nearest peak, ensuring no session straddles two slots.
//
// Step 5 – Filter by presence rate.
//   Peaks where the slot was actually pumped on < MIN_PRESENCE_PCT% of the
//   lookback days are discarded (they represent abandoned or transitional
//   slots, not current schedule fixtures).
//
// Output
// ------
// Same shape as the old functions so all callers are unaffected:
//   { label, hour, shiftedHour, sessionCount, daysPresent, presenceRate,
//     avgOutput, avgLeft, avgRight, kdePeakDensity }
// Sorted chronologically starting from 4 AM.
// ------------------------------------------------------------

function deriveCanonicalSessions(sessionsData, lookbackDays) {
  return _kdeSlotDetect(sessionsData, lookbackDays || 14);
}

// deriveSlotBasedSessions is now identical — both use KDE so callers that
// wanted "slot-anchored" vs "actual-time" clustering get the same, correct result.
function deriveSlotBasedSessions(sessionsData, lookbackDays) {
  return _kdeSlotDetect(sessionsData, lookbackDays || 14);
}

function _kdeSlotDetect(sessionsData, lookbackDays) {
  if (!sessionsData || sessionsData.length === 0) return [];

  // -- Helpers ------------------------------------------------------------

  function toSortable(ddmmyyyy) {
    const p = ddmmyyyy.split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
  }

  // Circular distance on a 24-hour clock (returns 0–12)
  function circDist(a, b) {
    const d = Math.abs(a - b) % 24;
    return d > 12 ? 24 - d : d;
  }

  // Gaussian kernel evaluated at circular distance d, bandwidth bw
  function gaussKernel(d, bw) {
    return Math.exp(-0.5 * (d / bw) * (d / bw));
  }

  // -- 1. Select lookback window ---------------------------------------------

  const allDates = [...new Set(sessionsData.map(function(s) { return s.date; }))]
    .sort(function(a, b) { return toSortable(a).localeCompare(toSortable(b)); });
  const recentDates = new Set(allDates.slice(-lookbackDays));
  const totalDays   = recentDates.size;

  const recent = sessionsData.filter(function(s) {
    return recentDates.has(s.date) && ((s.pumpLeft || 0) + (s.pumpRight || 0)) > 0;
  });
  if (recent.length === 0) return [];

  // -- 2. Resolve actual hour for every pump session -------------------------
  // Priority: pumpTime string → timeSlot canonical centre → timeSlot as string

  const SLOT_CENTRE = CANONICAL_SLOT_HOUR;

  function resolveHour(s) {
    // Try actual pump time first
    if (s.pumpTime && s.pumpTime !== '❌') {
      const h = parseTimeToHour(s.pumpTime);
      if (h !== null) return h;
    }
    // Fall back to canonical centre for the declared slot
    if (s.timeSlot && SLOT_CENTRE[s.timeSlot] !== undefined) {
      return SLOT_CENTRE[s.timeSlot];
    }
    // Last resort: try parsing the timeSlot string itself (e.g. "1:00 AM")
    if (s.timeSlot) {
      const h = parseTimeToHour(s.timeSlot);
      if (h !== null) return h;
    }
    return null;
  }

  const points = recent
    .map(function(s) {
      const h = resolveHour(s);
      if (h === null) return null;
      const output = (s.pumpLeft || 0) + (s.pumpRight || 0);
      return { session: s, hour: h, output: output };
    })
    .filter(Boolean);

  if (points.length === 0) return [];

  // -- 3. Derive σ and merge-threshold from actual inter-pump gaps -----------
  //
  // Since every recorded pump time is a genuine distinct session (no duplicates),
  // ALL consecutive gaps within a day are real between-slot gaps.
  //
  // Method:
  //   a) For each day, sort sessions by time and compute consecutive gaps.
  //   b) Take the MINIMUM gap of each day (= the tightest pair of slots that day).
  //   c) Compute the MEDIAN of those per-day minimums across all days in the
  //      lookback window → this is the characteristic minimum slot spacing.
  //   d) σ = medianMinGap / 4
  //      Why ÷4? At 3σ from a slot centre, a Gaussian kernel retains only 1%
  //      of its weight. With σ = gap/4, the kernel reaches 3σ = 0.75 × gap,
  //      which is well short of the next slot at 1.0 × gap. Zero bleed-over.
  //   e) Merge threshold = medianMinGap / 2
  //      Two KDE peaks closer than half the minimum slot spacing cannot be
  //      distinct intended slots — they must be the same slot drifting.
  //
  // Fallback: if fewer than 3 days have multiple sessions (can't compute gaps),
  // fall back to σ = 0.5 h and merge threshold = 1.5 h — conservative defaults.

  // Group points by date, sort each day's sessions by time
  const byDate = {};
  points.forEach(function(p) {
    const d = p.session.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(p.hour);
  });

  const perDayMinGaps = [];
  Object.values(byDate).forEach(function(hours) {
    if (hours.length < 2) return;
    hours.sort(function(a, b) { return a - b; });
    // Gaps between consecutive sessions (circular: also check wrap-around gap)
    const gaps = [];
    for (let i = 1; i < hours.length; i++) {
      gaps.push(hours[i] - hours[i - 1]);
    }
    // Wrap-around gap: from last session to first session next day (circular)
    gaps.push(24 - hours[hours.length - 1] + hours[0]);
    // Only the within-day linear gaps matter for slot spacing; skip wrap-around
    // (it represents overnight rest, not a slot gap in the normal sense)
    const linearGaps = gaps.slice(0, gaps.length - 1);
    perDayMinGaps.push(Math.min.apply(null, linearGaps));
  });

  let KDE_BW, MIN_SLOT_GAP;

  if (perDayMinGaps.length >= 3) {
    perDayMinGaps.sort(function(a, b) { return a - b; });
    const medianMinGap = perDayMinGaps[Math.floor(perDayMinGaps.length / 2)];
    KDE_BW       = medianMinGap / 4;         // σ: 3σ < nearest neighbour slot
    MIN_SLOT_GAP = medianMinGap / 2;         // merge threshold: half the min gap
    // Safety clamp: σ must be at least 10 min (handles extreme precision data)
    // and at most 1 h (prevents over-smoothing when gaps are very wide)
    KDE_BW = Math.max(0.167, Math.min(1.0, KDE_BW));
    MIN_SLOT_GAP = Math.max(0.5,  Math.min(2.5, MIN_SLOT_GAP));
  } else {
    // Fallback: not enough multi-session days to measure — use conservative defaults
    KDE_BW       = 0.5;    // 30 min
    MIN_SLOT_GAP = 1.5;    // 1 h 30 min
  }

  // -- 4. KDE on 24-hour circular axis, weighted by pump output -------------
  // 144 steps = 10-min resolution (every 10 min across 24 h)
  const KDE_STEPS = 144;
  const STEP_SIZE = 24 / KDE_STEPS;

  const density = new Array(KDE_STEPS).fill(0);
  for (let i = 0; i < KDE_STEPS; i++) {
    const t = i * STEP_SIZE;
    points.forEach(function(p) {
      density[i] += p.output * gaussKernel(circDist(t, p.hour), KDE_BW);
    });
  }

  // -- 5. Find local maxima --------------------------------------------------
  // A peak must be >= 8% of the global maximum to be considered a real slot.
  const maxDensity = Math.max.apply(null, density);
  const MIN_PEAK_RATIO = 0.08;

  const rawPeaks = [];
  for (let i = 0; i < KDE_STEPS; i++) {
    const prev = density[(i - 1 + KDE_STEPS) % KDE_STEPS];
    const curr = density[i];
    const next = density[(i + 1) % KDE_STEPS];
    if (curr >= prev && curr > next && curr >= maxDensity * MIN_PEAK_RATIO) {
      // Parabolic interpolation for sub-step peak accuracy
      const denom = prev - 2 * curr + next;
      const offset = denom !== 0 ? 0.5 * (prev - next) / denom : 0;
      const peakHour = ((i + offset) * STEP_SIZE + 24) % 24;
      rawPeaks.push({ hour: peakHour, density: curr });
    }
  }

  if (rawPeaks.length === 0) return [];

  // -- 6. Merge peaks closer than MIN_SLOT_GAP (same slot drifting) ---------
  // Sort by density descending so stronger peaks absorb weaker neighbours
  rawPeaks.sort(function(a, b) { return b.density - a.density; });

  const mergedPeaks = [];
  rawPeaks.forEach(function(p) {
    const close = mergedPeaks.find(function(m) {
      return circDist(m.hour, p.hour) < MIN_SLOT_GAP;
    });
    if (close) {
      // Merge: output-weighted mean hour (on linear axis — safe because gap < 1.75 h)
      const totalD = close.density + p.density;
      // Circular-safe weighted mean: expand the smaller angle toward the larger
      let dh = p.hour - close.hour;
      if (dh >  12) dh -= 24;
      if (dh < -12) dh += 24;
      close.hour    = (close.hour + dh * (p.density / totalD) + 24) % 24;
      close.density = totalD;
    } else {
      mergedPeaks.push({ hour: p.hour, density: p.density });
    }
  });

  // Sort chronologically (shifted to 4 AM pivot)
  const PIVOT = 4;
  mergedPeaks.forEach(function(p) {
    p.shiftedHour = (p.hour - PIVOT + 24) % 24;
  });
  mergedPeaks.sort(function(a, b) { return a.shiftedHour - b.shiftedHour; });

  // -- 6. Assign each session to its nearest peak ----------------------------
  // Use a "Voronoi" rule: a session belongs to the closest peak.
  // Additional guard: if the session is equidistant (within 2 min) it goes to
  // the higher-density peak.
  mergedPeaks.forEach(function(p) { p.sessions = []; });

  points.forEach(function(pt) {
    let best = null, bestDist = Infinity;
    mergedPeaks.forEach(function(p) {
      const d = circDist(pt.hour, p.hour);
      if (d < bestDist || (d === bestDist && p.density > best.density)) {
        bestDist = d; best = p;
      }
    });
    if (best) best.sessions.push(pt.session);
  });

  // -- 7. Build result, filter noise slots ----------------------------------
  // A slot is real only if it was actually pumped on at least MIN_PRESENCE_PCT
  // of the lookback days. Below that it's either a transitional slot being
  // phased out or a genuine anomaly day.
  const MIN_PRESENCE_PCT = 15;

  const result = [];
  mergedPeaks.forEach(function(p) {
    if (p.sessions.length === 0) return;

    const pumpSessions = p.sessions.filter(function(s) {
      return (s.pumpLeft || 0) + (s.pumpRight || 0) > 0;
    });
    const daysPresent = new Set(pumpSessions.map(function(s) { return s.date; })).size;
    const presencePct = (daysPresent / totalDays) * 100;

    if (presencePct < MIN_PRESENCE_PCT) return;   // noise / abandoned slot

    const totalOutput = pumpSessions.reduce(function(sum, s) { return sum + (s.pumpLeft || 0) + (s.pumpRight || 0); }, 0);
    const totalLeft   = pumpSessions.reduce(function(sum, s) { return sum + (s.pumpLeft  || 0); }, 0);
    const totalRight  = pumpSessions.reduce(function(sum, s) { return sum + (s.pumpRight || 0); }, 0);

    // Pump times are recorded at 30-minute granularity, so snap the KDE peak
    // to the nearest 30-minute boundary for the label.  The raw p.hour stays
    // precise for internal clustering but the label the AI sees must reflect
    // the actual recording resolution — never "5:56 AM", always "6:00 AM".
    const snappedHour = (Math.round(p.hour * 2) / 2 + 24) % 24;

    result.push({
      label:          formatHour(snappedHour),
      hour:           p.hour,          // precise, used for gap calculations
      shiftedHour:    p.shiftedHour,
      sessionCount:   pumpSessions.length,
      daysPresent:    daysPresent,
      presenceRate:   presencePct.toFixed(0),
      avgOutput:      Math.round(totalOutput / daysPresent),
      avgLeft:        Math.round(totalLeft   / daysPresent),
      avgRight:       Math.round(totalRight  / daysPresent),
      kdePeakDensity: p.density.toFixed(1),    // diagnostic: useful for debugging
    });
  });

  return result.sort(function(a, b) { return a.shiftedHour - b.shiftedHour; });
}

/**
 * For each canonical session compute: gap if dropped, merge opportunity with a close neighbour,
 * avg output, time recovered, and a verdict (drop | merge | caution | keep).
 *
 * Merge: two adjacent sessions within 2 hours -> suggest combining at midpoint.
 */
/**
 * For each canonical session compute: drop verdict, merge opportunity, avg output,
 * and a suggested redistribution schedule.
 *
 * KEY INSIGHT — redistribution model:
 * When a pumping session is dropped the mother does NOT leave a one-off gap where
 * it was; she redistributes the remaining N-1 sessions evenly across 24 hours
 * so that spacing between every pump increases uniformly. The correct measure of
 * "how hard will this be?" is therefore:
 *
 *   redistributedGap = 24 / (N - 1)
 *
 * …not gapBefore + gapAfter (the naive local-hole calculation which the old code
 * used and which always over-penalised symmetric schedules).
 *
 * The local raw gap (gapBefore + gapAfter) is still surfaced for reference because
 * it represents the worst-case first-night spacing if the mother simply stops one
 * session without rescheduling.
 *
 * Verdicts use the redistributed gap:
 *   ≤ GAP_SAFE    → 'drop'    (safe to remove)
 *   ≤ GAP_CAUTION → 'merge'   (if a merge partner is nearby) or 'caution'
 *   >  GAP_CAUTION → 'keep'   (too wide even after redistribution)
 */
function analyzeSessionDropCandidates(sessionsData, lookbackDays) {
  lookbackDays = lookbackDays || 14;
  const sessions = deriveSlotBasedSessions(sessionsData, lookbackDays);
  if (sessions.length < 2) return { sessions: sessions, candidates: [], summary: null };

  const n = sessions.length;
  const GAP_SAFE    = 5.0;
  const GAP_CAUTION = 6.5;
  const MERGE_WIN   = 2.0;

  // Circular gap between two sessions based on their shifted hour
  function gapH(a, b) {
    return ((b.shiftedHour - a.shiftedHour) + 24) % 24;
  }

  // After dropping the session at dropIdx the remaining N-1 sessions are
  // redistributed evenly, anchored at the first remaining session's actual hour.
  // Returns an array of { originalLabel, newHour, newLabel } objects.
  function redistributedSchedule(dropIdx) {
    const remaining = sessions.filter(function(_, i) { return i !== dropIdx; });
    if (remaining.length === 0) return [];
    const anchorHour = remaining[0].hour;
    const step = 24 / remaining.length;
    return remaining.map(function(s, i) {
      const newHour = (anchorHour + i * step) % 24;
      return {
        originalLabel: s.label,
        newHour:       newHour,
        newLabel:      formatHour(newHour),
      };
    });
  }

  // Uniform gap that results after dropping one session and redistributing evenly.
  const redistributedGap = 24 / (n - 1);

  const candidates = sessions.map(function(s, i) {
    const prev = sessions[(i - 1 + n) % n];
    const next = sessions[(i + 1) % n];
    const gapBefore     = gapH(prev, s);
    const gapAfter      = gapH(s, next);
    // Raw local hole — useful reference but NOT the basis for verdicts
    const rawGapIfDropped = gapBefore + gapAfter;

    // Merge candidate: a close neighbour with lower or equal output
    const prevClose = gapBefore <= MERGE_WIN;
    const nextClose = gapAfter  <= MERGE_WIN;
    let mergeWith = null;
    if      (prevClose && prev.avgOutput <= s.avgOutput) mergeWith = prev;
    else if (nextClose && next.avgOutput <= s.avgOutput) mergeWith = next;

    // Verdict based on redistributed (realistic) gap, not the raw local hole
    let verdict, gapFlag, note;
    if (redistributedGap <= GAP_SAFE) {
      verdict = 'drop'; gapFlag = 'safe';
    } else if (redistributedGap <= GAP_CAUTION) {
      verdict = mergeWith ? 'merge' : 'caution'; gapFlag = 'caution';
    } else {
      verdict = 'keep'; gapFlag = 'unsafe';
    }

    // Build the suggested redistribution schedule and note
    const newSchedule = redistributedSchedule(i);
    const scheduleStr = newSchedule.map(function(ns) { return ns.newLabel; }).join(' → ');

    if (mergeWith && verdict !== 'keep') {
      verdict = 'merge';
      const midShifted = (s.shiftedHour + mergeWith.shiftedHour) / 2;
      const midHour    = (midShifted + 4) % 24;
      note = 'Merge with ' + mergeWith.label + ' → single session at ~' + formatHour(midHour) + '; '
           + 'remaining ' + (n - 1) + ' sessions redistribute to ~' + redistributedGap.toFixed(1) + 'h spacing. '
           + 'Suggested: ' + scheduleStr;
    } else if (verdict !== 'keep') {
      note = 'Dropping leaves ' + (n - 1) + ' sessions at ~' + redistributedGap.toFixed(1) + 'h uniform spacing. '
           + 'Suggested: ' + scheduleStr;
    } else {
      note = 'Even with even redistribution the gap reaches ' + redistributedGap.toFixed(1) + 'h — '
           + 'above the safe threshold. Raw local gap if simply skipped: ' + rawGapIfDropped.toFixed(1) + 'h.';
    }

    return {
      label:             s.label,
      hour:              s.hour,
      avgOutput:         s.avgOutput,
      presenceRate:      s.presenceRate,
      gapBefore:         gapBefore.toFixed(1),
      gapAfter:          gapAfter.toFixed(1),
      // Raw local gap — reference only; NOT used for the verdict
      gapIfDropped:      rawGapIfDropped.toFixed(1),
      // Realistic gap assuming even redistribution — basis for the verdict
      redistributedGap:  redistributedGap.toFixed(1),
      gapFlag:           gapFlag,
      verdict:           verdict,
      note:              note,
      timeSavedMin:      30,
      suggestedSchedule: newSchedule,
    };
  });

  const order = { drop: 0, merge: 1, caution: 2, keep: 3 };
  candidates.sort(function(a, b) {
    return order[a.verdict] !== order[b.verdict]
      ? order[a.verdict] - order[b.verdict]
      : a.avgOutput - b.avgOutput;
  });

  const gaps    = sessions.map(function(s, i) { return gapH(s, sessions[(i + 1) % n]); });
  const sortedG = gaps.slice().sort(function(a, b) { return a - b; });
  const medianGap = sortedG[Math.floor(sortedG.length / 2)];
  const maxIdx    = gaps.indexOf(Math.max.apply(null, gaps));

  return {
    sessions:   sessions,
    candidates: candidates,
    summary: {
      totalSessions:    sessions.length,
      currentSpacingH:  (24 / n).toFixed(1),
      redistributedGapH: redistributedGap.toFixed(1),
      medianGapHours:   medianGap.toFixed(1),
      longestGapHours:  Math.max.apply(null, gaps).toFixed(1),
      longestGapSpan:   sessions[maxIdx].label + ' → ' + sessions[(maxIdx + 1) % n].label,
    }
  };
}

/**
 * Analyze left/right asymmetry by actual canonical session time.
 */
function analyzeAsymmetryByTimeOfDay(dailyData, sessionsData) {
  if (!sessionsData || sessionsData.length === 0) {
    return { status: 'insufficient_data' };
  }

  const canonical = deriveSlotBasedSessions(sessionsData, 14);
  if (canonical.length < 4) {
    return { status: 'insufficient_data' };
  }

  const analysis = canonical
    .filter(function(c) { return c.sessionCount >= 3; })
    .map(function(c) {
      const asymmetry = (c.avgLeft + c.avgRight) > 0
        ? Math.abs(c.avgLeft - c.avgRight) / Math.max(c.avgLeft, c.avgRight) * 100
        : 0;
      return {
        timeSlot:  c.label,
        sessions:  c.sessionCount,
        avgLeft:   c.avgLeft,
        avgRight:  c.avgRight,
        asymmetry: asymmetry.toFixed(1),
        dominant:  c.avgLeft >= c.avgRight ? 'left' : 'right',
      };
    });

  if (analysis.length < 3) {
    return { status: 'insufficient_data' };
  }

  const asymmetries = analysis.map(function(a) { return parseFloat(a.asymmetry); });
  const avgAsym = asymmetries.reduce(function(s, a) { return s + a; }, 0) / asymmetries.length;
  const stdDev = Math.sqrt(asymmetries.reduce(function(s, a) { return s + Math.pow(a - avgAsym, 2); }, 0) / asymmetries.length);
  const variability = avgAsym > 0 ? (stdDev / avgAsym) * 100 : 0;

  const mostAsymmetric  = analysis.reduce(function(max, a) { return parseFloat(a.asymmetry) > parseFloat(max.asymmetry) ? a : max; });
  const leastAsymmetric = analysis.reduce(function(min, a) { return parseFloat(a.asymmetry) < parseFloat(min.asymmetry) ? a : min; });
  const timeDependent   = variability < 15 ? 'consistent_throughout_day'
                        : variability < 30 ? 'moderately_time_dependent'
                        : 'highly_time_dependent';

  return {
    byTimeSlot:           analysis,
    mostAsymmetric:       mostAsymmetric,
    leastAsymmetric:      leastAsymmetric,
    avgAsymmetry:         avgAsym.toFixed(1),
    asymmetryVariability: variability.toFixed(1),
    timeDependent:        timeDependent
  };
}


/**
 * Analyze pump frequency patterns and correlation with output
 */
function analyzePumpFrequency(dailyData, sessionsData) {
  if (dailyData.length < 7) {
    return {
      status: 'insufficient_data'
    };
  }

  // Calculate daily pump frequency from sessions
  const dailyFrequency = dailyData.map(d => {
    const dayDate = d.date;
    const daySessions = sessionsData.filter(s => s.date === dayDate);
    const pumpSessions = daySessions.filter(s => (s.pumpLeft || 0) > 0 || (s.pumpRight || 0) > 0);

    return {
      date: d.date,
      sessions: pumpSessions.length,
      totalOutput: (d.pumpLeft || 0) + (d.pumpRight || 0)
    };
  });

  // Calculate 7-day rolling averages
  dailyFrequency.forEach((d, i) => {
    if (i >= 6) {
      const window = dailyFrequency.slice(i - 6, i + 1);
      d.avgFrequency = (window.reduce((sum, day) => sum + day.sessions, 0) / 7).toFixed(1);
      d.avgOutput = Math.round(window.reduce((sum, day) => sum + day.totalOutput, 0) / 7);
    } else {
      d.avgFrequency = null;
      d.avgOutput = null;
    }
  });

  const validData = dailyFrequency.filter(d => d.avgFrequency !== null);

  if (validData.length < 14) {
    return {
      status: 'insufficient_data'
    };
  }

  // Correlation helper function (defined here to avoid dependency issues)
  const calculateCorrelation = (x, y) => {
    const n = x.length;
    if (n < 2) return 0;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  };

  // Analyze with different lag periods
  const lagAnalysis = [0, 7, 14, 21].map(lag => {
    if (validData.length < lag + 7) return null;

    const frequencies = [];
    const outputs = [];

    for (let i = lag; i < validData.length; i++) {
      frequencies.push(parseFloat(validData[i - lag].avgFrequency));
      outputs.push(validData[i].avgOutput);
    }

    const correlation = calculateCorrelation(frequencies, outputs);

    return {
      lag: lag,
      correlation: correlation,
      strength: Math.abs(correlation) > 0.7 ? 'Strong' :
               Math.abs(correlation) > 0.4 ? 'Moderate' :
               Math.abs(correlation) > 0.2 ? 'Weak' : 'Very Weak',
      dataPoints: frequencies.length
    };
  }).filter(Boolean);

  // Find optimal lag
  const bestLag = lagAnalysis.reduce((best, current) =>
    Math.abs(current.correlation) > Math.abs(best.correlation) ? current : best
  );

  // Median helper
  const calcMedian = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Recent trends - median instead of mean
  const recent14Days = validData.slice(-14);
  const recentSessionCounts = recent14Days.map(d => parseFloat(d.avgFrequency));
  const recentMedianFreq = calcMedian(recentSessionCounts).toFixed(1);
  const recentAvgOutput = Math.round(recent14Days.reduce((sum, d) => sum + d.avgOutput, 0) / 14);

  // Frequency change analysis - median first week vs last week
  const firstWeek = validData.slice(0, 7);
  const lastWeek = validData.slice(-7);
  const firstWeekFreq = calcMedian(firstWeek.map(d => parseFloat(d.avgFrequency))).toFixed(1);
  const lastWeekFreq = calcMedian(lastWeek.map(d => parseFloat(d.avgFrequency))).toFixed(1);
  const freqChange = ((lastWeekFreq - firstWeekFreq) / firstWeekFreq * 100).toFixed(1);

  // Output per session based on median frequency
  const outputPerSession = parseFloat(recentMedianFreq) > 0 ? Math.round(recentAvgOutput / parseFloat(recentMedianFreq)) : 0;

  return {
    recentMedianFreq: recentMedianFreq,
    recentAvgOutput: recentAvgOutput,
    freqChange: freqChange,
    outputPerSession: outputPerSession,
    lagAnalysis: lagAnalysis,
    bestLag: bestLag,
    allData: validData.map(d => ({
      date: d.date,
      sessions: d.sessions,
      avgFrequency: d.avgFrequency,
      totalOutput: d.totalOutput,
      avgOutput: d.avgOutput
    }))
  };
}

/**
 * Calculate Z-score trajectory over time
 */
function calculateZScoreTrajectory(dailyData, babyConfig) {
  const measurements = dailyData
    .filter(d => d.weight)
    .map(d => {
      const days = getDaysFromBirth(d.date, babyConfig.birthDate);
      const zScore = babyConfig.calculateZScore(days, d.weight, 'weight');
      const percentile = zScore !== null ? babyConfig.zScoreToPercentile(zScore) : null;

      return {
        date: d.date,
        days: days,
        weight: d.weight,
        zScore: zScore !== null ? zScore.toFixed(2) : null,
        percentile: percentile !== null ? percentile.toFixed(1) : null
      };
    })
    .filter(m => m.zScore !== null)
    .sort((a, b) => a.days - b.days);

  if (measurements.length < 2) {
    return {
      status: 'insufficient_data'
    };
  }

  // Calculate Z-score changes
  const changes = [];
  for (let i = 1; i < measurements.length; i++) {
    const prev = measurements[i - 1];
    const curr = measurements[i];
    const zChange = parseFloat(curr.zScore) - parseFloat(prev.zScore);

    changes.push({
      fromDate: prev.date,
      toDate: curr.date,
      fromZ: prev.zScore,
      toZ: curr.zScore,
      change: zChange.toFixed(2),
      direction: zChange > 0.1 ? 'improving' : zChange < -0.1 ? 'declining' : 'stable'
    });
  }

  // Overall trajectory
  const firstZ = parseFloat(measurements[0].zScore);
  const lastZ = parseFloat(measurements[measurements.length - 1].zScore);
  const totalChange = lastZ - firstZ;
  const overallDirection = totalChange > 0.3 ? 'improving' : totalChange < -0.3 ? 'declining' : 'stable';

  // Current position
  const currentZ = parseFloat(measurements[measurements.length - 1].zScore);
  let currentCategory;
  if (currentZ < -2) {
    currentCategory = 'below_normal_range';
  } else if (currentZ < -1) {
    currentCategory = 'lower_end_normal';
  } else if (currentZ <= 1) {
    currentCategory = 'mid_normal_range';
  } else if (currentZ <= 2) {
    currentCategory = 'upper_end_normal';
  } else {
    currentCategory = 'above_normal_range';
  }

  return {
    allMeasurements: measurements,
    changes: changes,
    firstZScore: measurements[0].zScore,
    currentZScore: measurements[measurements.length - 1].zScore,
    currentPercentile: measurements[measurements.length - 1].percentile,
    totalChange: totalChange.toFixed(2),
    overallDirection: overallDirection,
    currentCategory: currentCategory
  };
}

// Existing metric functions — kept for compatibility.

function calculateMetrics(dailyData, sessionsData, babyConfig) {
  const metrics = {
    totalDays: dailyData.length,
    dateRange: {
      start: dailyData[0].date,
      end: dailyData[dailyData.length - 1].date
    },
    currentAge: null,
    production: {},
    consumption: {},
    growth: {},
    patterns: {},
    latestMeasurements: {},
    weeklyAverages: [],
    historicalTrends: {},
    sessionAnalysis: {}
  };

  // Current age calculation
  const lastDate = parseDate(dailyData[dailyData.length - 1].date);
  if (lastDate) {
    const ageInDays = Math.floor((lastDate - babyConfig.birthDate) / (1000 * 60 * 60 * 24));
    metrics.currentAge = {
      days: ageInDays,
      weeks: Math.floor(ageInDays / 7),
      months: (ageInDays / 30.4).toFixed(1)
    };
  }

  // Production metrics - LAST 2 WEEKS ONLY
  const last14Days = dailyData.slice(-14);
  const allProduction = dailyData.map(d => (d.pumpLeft || 0) + (d.pumpRight || 0));
  const recentProduction = last14Days.map(d => (d.pumpLeft || 0) + (d.pumpRight || 0));

  const sortedRecent = [...recentProduction].sort((a, b) => a - b);
  const recentMedian = sortedRecent[Math.floor(sortedRecent.length / 2)];

  metrics.production = {
    recentAverage: Math.round(recentProduction.reduce((a, b) => a + b, 0) / recentProduction.length),
    recentMedian: Math.round(recentMedian),
    recentMin: Math.min(...recentProduction),
    recentMax: Math.max(...recentProduction),
    recentStdDev: calculateStdDev(recentProduction).toFixed(1),
    total: (allProduction.reduce((a, b) => a + b, 0) / 1000).toFixed(1) + ' L',
    leftRightRatio: calculateLeftRightRatio(last14Days),
    recentDateRange: `${last14Days[0].date} to ${last14Days[last14Days.length - 1].date}`
  };

  // Calculate 7-day rolling averages for ALL weeks
  metrics.weeklyAverages = calculateWeeklyRollingAverages(dailyData, babyConfig.birthDate);

  // Consumption metrics - LAST 2 WEEKS ONLY
  const formulaDays = last14Days.filter(d => (d.form || 0) > 0);
  const formulaFreeDays = last14Days.filter(d => (d.form || 0) === 0);
  const firstFormulaFreeDate = findFirstFormulaFreeWeek(dailyData);
  const lastFormulaDate = findLastFormulaDate(dailyData);

  const avgExpr = Math.round(last14Days.reduce((sum, d) => sum + (d.expr || 0), 0) / last14Days.length);
  const avgForm = Math.round(last14Days.reduce((sum, d) => sum + (d.form || 0), 0) / last14Days.length);
  const totalConsumed = avgExpr + avgForm;

  metrics.consumption = {
    formulaDays: formulaDays.length,
    formulaFreeDays: formulaFreeDays.length,
    formulaFreeRate: ((formulaFreeDays.length / last14Days.length) * 100).toFixed(1) + '%',
    firstFormulaFreeWeek: firstFormulaFreeDate,
    lastFormulaDate: lastFormulaDate,
    daysSinceLastFormula: lastFormulaDate ? calculateDaysBetween(lastFormulaDate, last14Days[last14Days.length - 1].date) : 'N/A',
    averageExpr: avgExpr,
    averageForm: avgForm,
    totalConsumed: totalConsumed,
    exprPercent: totalConsumed > 0 ? ((avgExpr / totalConsumed) * 100).toFixed(1) + '%' : '0%',
    recentDateRange: `${last14Days[0].date} to ${last14Days[last14Days.length - 1].date}`
  };

  // Latest measurements
  const latestWeight = getLatestMeasurement(dailyData, 'weight');
  const latestHeight = getLatestMeasurement(dailyData, 'height');
  const latestHeadCirc = getLatestMeasurement(dailyData, 'headCirc');

  metrics.latestMeasurements = {
    weight: latestWeight ? `${latestWeight.value} kg (${latestWeight.date})` : 'No data',
    height: latestHeight ? `${latestHeight.value} cm (${latestHeight.date})` : 'No data',
    headCirc: latestHeadCirc ? `${latestHeadCirc.value} cm (${latestHeadCirc.date})` : 'No data',
    measurementDate: latestWeight ? latestWeight.date : 'N/A'
  };

  // Compute z-scores and percentiles for height, HC, and BMI
  function zAndPct(days, value, type) {
    if (!value || !days) return null;
    const z = babyConfig.calculateZScore(days, value, type);
    if (z === null) return null;
    const pct = babyConfig.zScoreToPercentile(z);
    return { z: z.toFixed(2), percentile: pct.toFixed(1) };
  }

  if (latestHeight) {
    const days = getDaysFromBirth(latestHeight.date, babyConfig.birthDate);
    const who50 = babyConfig._getLMSForType(days, 'length').M;
    const who3  = babyConfig.calculateZScore(days, 0, 'length'); // placeholder to get M
    const lms   = babyConfig._getLMSForType(days, 'length');
    const p3val  = (lms.M * Math.pow(1 + lms.L * lms.S * -1.88, 1/lms.L)).toFixed(1);
    const p50val = lms.M.toFixed(1);
    const p97val = (lms.M * Math.pow(1 + lms.L * lms.S *  1.88, 1/lms.L)).toFixed(1);
    const stats  = zAndPct(days, latestHeight.value, 'length');
    metrics.latestMeasurements.heightStats = stats
      ? `Z=${stats.z}, ${stats.percentile}th percentile (WHO 3rd=${p3val}cm, 50th=${p50val}cm, 97th=${p97val}cm at ${days}d)`
      : null;
  }

  if (latestHeadCirc) {
    const days  = getDaysFromBirth(latestHeadCirc.date, babyConfig.birthDate);
    const lms   = babyConfig._getLMSForType(days, 'headCirc');
    const p3val  = (lms.M * Math.exp(lms.S * -1.88)).toFixed(1);
    const p50val = lms.M.toFixed(1);
    const p97val = (lms.M * Math.exp(lms.S *  1.88)).toFixed(1);
    const stats  = zAndPct(days, latestHeadCirc.value, 'headCirc');
    metrics.latestMeasurements.headCircStats = stats
      ? `Z=${stats.z}, ${stats.percentile}th percentile (WHO 3rd=${p3val}cm, 50th=${p50val}cm, 97th=${p97val}cm at ${days}d)`
      : null;
  }

  if (latestWeight && latestHeight) {
    const days   = getDaysFromBirth(latestWeight.date, babyConfig.birthDate);
    const bmi    = latestWeight.value / Math.pow(latestHeight.value / 100, 2);
    const lms    = babyConfig._getLMSForType(days, 'bmi');
    const p3bmi  = (lms.M * Math.pow(1 + lms.L * lms.S * -1.88, 1/lms.L)).toFixed(1);
    const p50bmi = lms.M.toFixed(1);
    const p97bmi = (lms.M * Math.pow(1 + lms.L * lms.S *  1.88, 1/lms.L)).toFixed(1);
    const stats  = zAndPct(days, bmi, 'bmi');
    metrics.latestMeasurements.bmi = bmi.toFixed(1);
    metrics.latestMeasurements.bmiStats = stats
      ? `BMI=${bmi.toFixed(1)}, Z=${stats.z}, ${stats.percentile}th percentile (WHO 3rd=${p3bmi}, 50th=${p50bmi}, 97th=${p97bmi} at ${days}d)`
      : null;
  }

  // Growth metrics
  const weightMeasurements = dailyData.filter(d => d.weight).map(d => ({
    date: d.date,
    weight: d.weight,
    days: getDaysFromBirth(d.date, babyConfig.birthDate)
  }));

  if (weightMeasurements.length >= 2) {
    const latest = weightMeasurements[weightMeasurements.length - 1];
    const first = weightMeasurements[0];
    const totalGain = (latest.weight - first.weight) * 1000;
    const totalDays = latest.days - first.days;
    const gPerDay = totalGain / totalDays;

    metrics.growth = {
      currentWeight: latest.weight + ' kg',
      birthWeight: first.weight + ' kg',
      totalGain: totalGain.toFixed(0) + ' g',
      averageGainPerDay: gPerDay.toFixed(1) + ' g/day',
      averageGainPerWeek: (gPerDay * 7).toFixed(0) + ' g/week',
      measurements: weightMeasurements.length,
      allMeasurements: weightMeasurements.map(m => `${m.date}: ${m.weight} kg (Day ${m.days})`)
    };

    // Recent velocity
    if (weightMeasurements.length >= 2) {
      const recent = weightMeasurements.slice(-2);
      const recentGain = (recent[1].weight - recent[0].weight) * 1000;
      const recentDays = recent[1].days - recent[0].days;
      metrics.growth.recentVelocity = ((recentGain / recentDays) * 7).toFixed(0) + ' g/week';
      metrics.growth.recentVelocityDays = `${recentDays} days between measurements`;
    }

    // Velocity trend
    if (weightMeasurements.length >= 3) {
      const last3 = weightMeasurements.slice(-3);
      const velocities = [];
      for (let i = 1; i < last3.length; i++) {
        const gain = (last3[i].weight - last3[i-1].weight) * 1000;
        const days = last3[i].days - last3[i-1].days;
        velocities.push((gain / days) * 7);
      }
      metrics.growth.velocityTrend = velocities.map(v => v.toFixed(0) + ' g/week').join(' -> ');
    }
  }

  // Circadian patterns - LAST 2 WEEKS ONLY
  const last14DaysSessions = sessionsData.filter(s => {
    const sessionDate = s.date;
    return last14Days.some(d => d.date === sessionDate);
  });
  metrics.patterns = analyzeCircadianPattern(last14DaysSessions);

  // Historical trends
  metrics.historicalTrends = analyzeHistoricalTrends(dailyData);

  // Session analysis
  metrics.sessionAnalysis = analyzeSessionPatterns(sessionsData);
  metrics.perSlotFeedAnalysis = analyzePerSlotFeedVolumes(sessionsData, dailyData);

  // Anomalies
  metrics.anomalies = detectAnomalies(dailyData);

  return metrics;
}

function calculateWeeklyRollingAverages(dailyData, birthDate) {
  const weekGroups = {};

  dailyData.forEach(d => {
    const entryDate = parseDate(d.date);
    if (!entryDate) return;

    const days = Math.floor((entryDate - birthDate) / (1000 * 60 * 60 * 24));
    const weekOfLife = Math.floor(days / 7) + 1;

    if (!weekGroups[weekOfLife]) weekGroups[weekOfLife] = [];
    weekGroups[weekOfLife].push(d);
  });

  const weeklyData = [];
  Object.keys(weekGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(weekNum => {
    const weekData = weekGroups[weekNum];
    const production = weekData.map(d => (d.pumpLeft || 0) + (d.pumpRight || 0));
    const expr = weekData.map(d => d.expr || 0);
    const form = weekData.map(d => d.form || 0);

    const avgProduction = production.reduce((a, b) => a + b, 0) / production.length;
    const avgExpr = expr.reduce((a, b) => a + b, 0) / expr.length;
    const avgForm = form.reduce((a, b) => a + b, 0) / form.length;

    weeklyData.push({
      week: parseInt(weekNum),
      dateRange: `${weekData[0].date} to ${weekData[weekData.length - 1].date}`,
      days: weekData.length,
      avgProduction: Math.round(avgProduction),
      avgExpr: Math.round(avgExpr),
      avgForm: Math.round(avgForm),
      formulaFreeDays: weekData.filter(d => (d.form || 0) === 0).length
    });
  });

  return weeklyData;
}

function analyzeHistoricalTrends(dailyData) {
  const trends = {
    productionTrend: 'stable',
    peakProduction: { value: 0, date: null },
    lowestProduction: { value: Infinity, date: null },
    longestFormulaFreeStreak: 0,
    currentFormulaFreeStreak: 0
  };

  dailyData.forEach(d => {
    const total = (d.pumpLeft || 0) + (d.pumpRight || 0);
    if (total > trends.peakProduction.value) {
      trends.peakProduction = { value: total, date: d.date };
    }
    if (total > 0 && total < trends.lowestProduction.value) {
      trends.lowestProduction = { value: total, date: d.date };
    }
  });

  // Current streak: count backwards from most recent day
  let currentStreak = 0;
  for (let i = dailyData.length - 1; i >= 0; i--) {
    if ((dailyData[i].form || 0) === 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Longest streak: forward pass across all data
  let maxStreak = 0;
  let runningStreak = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if ((dailyData[i].form || 0) === 0) {
      runningStreak++;
      maxStreak = Math.max(maxStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  trends.currentFormulaFreeStreak = currentStreak;
  trends.longestFormulaFreeStreak = maxStreak;

  const midpoint = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, midpoint);
  const secondHalf = dailyData.slice(midpoint);

  const firstHalfAvg = firstHalf.reduce((sum, d) => sum + (d.pumpLeft || 0) + (d.pumpRight || 0), 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, d) => sum + (d.pumpLeft || 0) + (d.pumpRight || 0), 0) / secondHalf.length;

  if (secondHalfAvg > firstHalfAvg * 1.1) {
    trends.productionTrend = 'increasing';
  } else if (secondHalfAvg < firstHalfAvg * 0.9) {
    trends.productionTrend = 'decreasing';
  }

  return trends;
}

function analyzeSessionPatterns(sessionsData) {
  if (sessionsData.length === 0) {
    return {
      totalSessions: 0,
      avgSessionsPerDay: 0,
      mostFrequentTimeSlot: null,
      avgPumpPerSession: 0,
      avgFeedPerSession: 0
    };
  }

  const uniqueDates = [...new Set(sessionsData.map(s => s.date))];

  const slotCounts = {};
  sessionsData.forEach(s => {
    const slot = resolveSlot(s) || s.timeSlot || 'Unknown';
    slotCounts[slot] = (slotCounts[slot] || 0) + 1;
  });

  const pumpVolumes = sessionsData.map(s => (s.pumpLeft || 0) + (s.pumpRight || 0)).filter(v => v > 0);
  const feedVolumes = sessionsData.map(s => (s.exprMilk || 0) + (s.formula || 0)).filter(v => v > 0);

  return {
    totalSessions: sessionsData.length,
    avgSessionsPerDay: (sessionsData.length / uniqueDates.length).toFixed(1),
    mostFrequentTimeSlot: Object.keys(slotCounts).reduce((a, b) => slotCounts[a] > slotCounts[b] ? a : b),
    avgPumpPerSession: pumpVolumes.length > 0 ? Math.round(pumpVolumes.reduce((a, b) => a + b, 0) / pumpVolumes.length) : 0,
    avgFeedPerSession: feedVolumes.length > 0 ? Math.round(feedVolumes.reduce((a, b) => a + b, 0) / feedVolumes.length) : 0
  };
}

/**
 * Analyse per-time-slot feed volumes for the last 21 days.
 * Returns per-slot stats (avg, median, min, max, count, partial-feed rate)
 * plus overall avg feed per session and an optimized schedule suggestion.
 */
function analyzePerSlotFeedVolumes(sessionsData, dailyData) {
  // Last 21 days
  const allDates = [...new Set(sessionsData.map(s => s.date))].sort((a, b) => parseDate(a) - parseDate(b));
  const cutoffDate = allDates.length > 21 ? allDates[allDates.length - 22] : null;
  const recent = cutoffDate
    ? sessionsData.filter(s => parseDate(s.date) > parseDate(cutoffDate))
    : sessionsData;

  if (recent.length === 0) return null;

  // Group by canonical time slot
  const slotMap = {};
  recent.forEach(s => {
    const slot = resolveSlot(s) || s.timeSlot || 'Unknown';
    if (!slotMap[slot]) slotMap[slot] = [];
    const vol = (s.exprMilk || 0) + (s.formula || 0);
    if (vol > 0) slotMap[slot].push({ vol, feedTime: s.feedTime || null, date: s.date });
  });

  // Compute stats per slot
  const slotStats = Object.entries(slotMap).map(([slot, feeds]) => {
    if (feeds.length === 0) return null;
    const vols = feeds.map(f => f.vol).sort((a, b) => a - b);
    const sum = vols.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / vols.length);
    const mid = Math.floor(vols.length / 2);
    const median = vols.length % 2 !== 0 ? vols[mid] : Math.round((vols[mid - 1] + vols[mid]) / 2);
    const partialFeeds = vols.filter(v => v <= 20).length; // ≤20 ml = likely partial / wastage-risk
    const partialRate = Math.round((partialFeeds / vols.length) * 100);

    // Derive actual feed times from feedTime field
    const actualTimes = feeds
      .map(f => f.feedTime)
      .filter(t => t && t !== '❌' && t !== '' && !isNaN(Date.parse('1970-01-01 ' + t)));

    // Convert times to minutes-since-midnight, find median actual time
    const toMinutes = t => {
      const [time, period] = t.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + (m || 0);
    };
    const timeMins = actualTimes.map(toMinutes).sort((a, b) => a - b);
    const medianTimeMins = timeMins.length > 0 ? timeMins[Math.floor(timeMins.length / 2)] : null;
    const formatMins = mins => {
      if (mins === null) return null;
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    return {
      slot,
      count: vols.length,
      avg,
      median,
      min: vols[0],
      max: vols[vols.length - 1],
      partialRate,
      medianActualTime: formatMins(medianTimeMins),
      scheduledSlot: slot
    };
  }).filter(Boolean);

  // Sort slots by scheduled time order
  const slotOrder = ['12:00 AM','3:00 AM','6:00 AM','9:00 AM','12:00 PM','3:00 PM','6:00 PM','9:00 PM'];
  slotStats.sort((a, b) => {
    const ai = slotOrder.indexOf(a.slot);
    const bi = slotOrder.indexOf(b.slot);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Overall avg feed per session across all slots
  const allVols = Object.values(slotMap).flat().map(f => f.vol);
  const overallAvg = allVols.length > 0 ? Math.round(allVols.reduce((a, b) => a + b, 0) / allVols.length) : 0;

  // High-partial-rate slots (wastage risk)
  const wastageRiskSlots = slotStats.filter(s => s.partialRate >= 30);

  // Optimized schedule: recommend actual time = medianActualTime (or slot midpoint),
  // recommended volume = median of that slot (more robust than avg)
  const optimizedSchedule = slotStats.map(s => ({
    slot: s.slot,
    recommendedTime: s.medianActualTime || s.slot,
    recommendedVolume: s.median,
    avgVolume: s.avg,
    rationale: s.partialRate >= 30
      ? `High partial-feed rate (${s.partialRate}%) — split into smaller feeds or push gap to build hunger`
      : s.median < overallAvg * 0.7
        ? `Low-intake slot — consider merging with adjacent feed or reducing offer volume to ${s.median} ml`
        : `Consistent intake — offer ${s.median}–${Math.min(s.max, s.median + 20)} ml`
  }));

  return {
    periodDays: Math.min(21, allDates.length),
    overallAvgFeedPerSession: overallAvg,
    totalFeedSessions: allVols.length,
    slotStats,
    wastageRiskSlots,
    optimizedSchedule
  };
}

function findLastFormulaDate(dailyData) {
  for (let i = dailyData.length - 1; i >= 0; i--) {
    if ((dailyData[i].form || 0) > 0) return dailyData[i].date;
  }
  return null;
}

function calculateDaysBetween(date1Str, date2Str) {
  const d1 = parseDate(date1Str);
  const d2 = parseDate(date2Str);
  if (!d1 || !d2) return 0;
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getLatestMeasurement(dailyData, field) {
  for (let i = dailyData.length - 1; i >= 0; i--) {
    if (dailyData[i][field] !== null && dailyData[i][field] !== undefined && dailyData[i][field] !== '') {
      return { value: dailyData[i][field], date: dailyData[i].date };
    }
  }
  return null;
}

function calculateLeftRightRatio(dailyData) {
  const totalLeft = dailyData.reduce((sum, d) => sum + (d.pumpLeft || 0), 0);
  const totalRight = dailyData.reduce((sum, d) => sum + (d.pumpRight || 0), 0);
  return totalRight > 0 ? (totalLeft / totalRight).toFixed(2) : '0';
}

function findFirstFormulaFreeWeek(dailyData) {
  for (let i = 6; i < dailyData.length; i++) {
    const week = dailyData.slice(i - 6, i + 1);
    if (week.every(d => (d.form || 0) === 0)) {
      return dailyData[i].date;
    }
  }
  return null;
}

/**
 * Build circadian pattern metrics from canonical sessions (actual pump times, not fixed slots).
 */
function analyzeCircadianPattern(sessionsData) {
  const canonical = deriveSlotBasedSessions(sessionsData, 14);
  if (canonical.length === 0) {
    return { sessions: [], bestSession: null, worstSession: null, nightAvg: 0, dayAvg: 0 };
  }

  const best  = canonical.reduce(function(a, b) { return a.avgOutput >= b.avgOutput ? a : b; });
  const worst = canonical.reduce(function(a, b) { return a.avgOutput <= b.avgOutput ? a : b; });

  // Night = 9 PM to 6 AM (hours 21-23 and 0-5)
  const nightSessions = canonical.filter(function(c) { return c.hour >= 21 || c.hour < 6; });
  const daySessions   = canonical.filter(function(c) { return c.hour >= 6  && c.hour < 21; });
  const avg = function(arr) {
    return arr.length ? Math.round(arr.reduce(function(s, c) { return s + c.avgOutput; }, 0) / arr.length) : 0;
  };

  return {
    sessions:     canonical,
    bestSession:  best,
    worstSession: worst,
    nightAvg:     avg(nightSessions),
    dayAvg:       avg(daySessions),
  };
}

function detectAnomalies(dailyData) {
  const anomalies = [];
  const heights = dailyData.filter(d => d.height).map((d, i) => ({ value: d.height, date: d.date, index: i }));

  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1].value;
    const curr = heights[i].value;
    const next = heights[i + 1].value;

    if ((prev < curr && curr > next) || (prev > curr && curr < next)) {
      anomalies.push({
        type: 'height',
        date: heights[i].date,
        value: curr,
        reason: 'Measurement spike/dip detected'
      });
    }
  }

  return anomalies;
}

/**
 * Detect historical pump schedule epochs from session-level data.
 *
 * The mother deliberately reduced her pump schedule over time
 * (e.g. 8 sessions/day → 7 → 6), with each transition based on personal
 * tolerance thresholds. This function identifies those eras and their
 * canonical slot patterns so the AI can give historically-grounded advice.
 *
 * Returns:
 *   { epochs: [ { sessionCount, startDate, endDate, dayCount, slots: [...] } ],
 *     currentEpoch, evolutionSummary }
 */
function detectScheduleEvolution(dailyData, sessionsData) {
  if (!dailyData || dailyData.length < 14) {
    return { epochs: [], currentEpoch: null, evolutionSummary: 'Insufficient data' };
  }

  function toISO(ddmmyyyy) {
    const p = ddmmyyyy.split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
  }

  const SLOT_HOUR = CANONICAL_SLOT_HOUR;  // shared — no local redefinition needed

  // -- 1. Compute daily session counts (pump only) -------------------------
  const daily = dailyData.map(d => {
    const pumpSessions = Array.isArray(d.sessions)
      ? d.sessions.filter(s => (s.pumpLeft || 0) + (s.pumpRight || 0) > 0).length
      : 0;
    return { date: d.date, sessions: pumpSessions };
  }).filter(d => d.date);

  // -- 2. Rolling 7-day median ---------------------------------------------
  const WINDOW = 7;
  for (let i = 0; i < daily.length; i++) {
    if (i < WINDOW - 1) { daily[i].median = null; continue; }
    const win = daily.slice(i - WINDOW + 1, i + 1).map(x => x.sessions).sort((a, b) => a - b);
    daily[i].median = win[Math.floor(win.length / 2)];
  }

  // -- 3. Segment into raw epochs -----------------------------------------
  const rawEpochs = [];
  let cur = null;
  for (const d of daily) {
    const m = d.median;
    if (m === null) continue;
    if (!cur || cur.sessionCount !== m) {
      if (cur) rawEpochs.push(cur);
      cur = { sessionCount: m, startDate: d.date, endDate: d.date, dayCount: 1 };
    } else {
      cur.endDate = d.date;
      cur.dayCount++;
    }
  }
  if (cur) rawEpochs.push(cur);

  // -- 4. Merge epochs: three passes ------------------------------------
  //
  // Pass A — merge adjacent same-count eras into one.
  // Pass B — absorb short eras (< 14 days) into the previous era.
  //          Never absorb the last era (protect current schedule even if new).
  // Pass C — same as Pass A, run again after Pass B because absorbing blips
  //          can leave two same-count eras now adjacent that weren't before.
  //          (e.g. 8 / [blip] / 8 → after B becomes 8-extended / 8 → C merges to one 8)

  function collapseAdjacentSameCount(list) {
    const out = [];
    for (const era of list) {
      const prev = out[out.length - 1];
      if (prev && prev.sessionCount === era.sessionCount) {
        prev.endDate  = era.endDate;
        prev.dayCount += era.dayCount;
      } else {
        out.push({ ...era });
      }
    }
    return out;
  }

  // Pass A
  const afterA = collapseAdjacentSameCount(rawEpochs);

  // Pass B
  const MIN_ERA = 14;
  const afterB = [];
  for (let i = 0; i < afterA.length; i++) {
    const era       = afterA[i];
    const isLast    = (i === afterA.length - 1);
    const prevEpoch = afterB[afterB.length - 1];
    if (!isLast && era.dayCount < MIN_ERA && prevEpoch) {
      prevEpoch.endDate  = era.endDate;
      prevEpoch.dayCount += era.dayCount;
    } else {
      afterB.push({ ...era });
    }
  }

  // Pass C
  const epochs = collapseAdjacentSameCount(afterB);

  // -- 5. Compute slot profile for each epoch using KDE -----------------
  // Canonical bucketing fails when the schedule drifts from the 3-hour grid
  // (e.g. 7-pump era has a floating start time, so sessions land in different
  // canonical buckets on different days, producing phantom slots).
  // Instead, run _kdeSlotDetect on each era's sessions directly — it finds
  // actual density peaks without assuming any anchor grid.
  if (sessionsData && sessionsData.length > 0) {
    epochs.forEach(era => {
      const isoStart = toISO(era.startDate), isoEnd = toISO(era.endDate);

      // Collect sessions in this era that match the era's session count per day
      const sessionsByDate = {};
      sessionsData.forEach(s => {
        const iso = toISO(s.date);
        if (iso < isoStart || iso > isoEnd) return;
        if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
        sessionsByDate[s.date].push(s);
      });

      const eraSessions = [];
      Object.keys(sessionsByDate).forEach(date => {
        const dayPumped = sessionsByDate[date].filter(function(s) {
          return (s.pumpLeft || 0) + (s.pumpRight || 0) > 0;
        });
        // Only include on-schedule days — off-count days pollute the profile
        if (dayPumped.length !== era.sessionCount) return;
        sessionsByDate[date].forEach(s => eraSessions.push(s));
      });

      if (eraSessions.length === 0) { era.slots = []; return; }

      // Pass all era sessions as if they were a lookback window of era.dayCount days
      const kdeSlots = _kdeSlotDetect(eraSessions, era.dayCount + 30);
      // +30 ensures the lookback window comfortably covers all era dates even if
      // some days have gaps (illness, travel) with fewer sessions than era.sessionCount

      era.slots = kdeSlots.map(function(k) {
        return {
          slot:        k.label,        // snapped to 30-min boundary
          actualHour:  k.hour,         // precise KDE peak (used for gap calc)
          avgOutput:   k.avgOutput,
          occurrences: k.sessionCount
        };
      });
    });
  } else {
    epochs.forEach(era => { era.slots = []; });
  }

  const currentEpoch = epochs[epochs.length - 1] || null;

  // -- 6. Compute per-era output metrics from dailyData -------------------
  // Days where pump count is meaningfully below the era norm are treated as
  // likely direct-BF substitution days: the mother was attempting direct
  // breastfeeding, replacing some pump sessions — not losing supply.
  // These days are excluded from era output averages (which would otherwise
  // be dragged down) and reported separately so the AI has full context.
  //
  // Threshold: a day is flagged as a BF-substitution day if its pump session
  // count is more than 1 below the era's declared sessionCount AND the era
  // has at least 14 days of data (so we don't mis-flag the early ramp-up).
  epochs.forEach(function(era) {
    const isoStart = toISO(era.startDate), isoEnd = toISO(era.endDate);
    const eraDays = dailyData.filter(function(d) {
      const iso = toISO(d.date);
      return iso >= isoStart && iso <= isoEnd;
    });

    // Count pump sessions per day using session-level data when available,
    // otherwise fall back to the daily record's own session array.
    const bfSubstDays = [];
    const normalDays  = [];

    eraDays.forEach(function(d) {
      const pumpCount = Array.isArray(d.sessions)
        ? d.sessions.filter(function(s) { return (s.pumpLeft||0)+(s.pumpRight||0) > 0; }).length
        : ((d.pumpLeft||0)+(d.pumpRight||0) > 0 ? 1 : 0);

      if (era.dayCount >= 14 && pumpCount < era.sessionCount - 1) {
        bfSubstDays.push({ date: d.date, pumpCount: pumpCount,
                           output: (d.pumpLeft||0)+(d.pumpRight||0) });
      } else {
        normalDays.push(d);
      }
    });

    const outputDays = normalDays.filter(function(d) {
      return (d.pumpLeft||0)+(d.pumpRight||0) > 0;
    });
    const totalOutput = outputDays.reduce(function(s, d) {
      return s + (d.pumpLeft||0)+(d.pumpRight||0);
    }, 0);

    era.avgDailyOutput   = outputDays.length > 0 ? Math.round(totalOutput / outputDays.length) : 0;
    era.outputPerSession = era.sessionCount > 0   ? Math.round(era.avgDailyOutput / era.sessionCount) : 0;

    // Surface BF-substitution period for the AI
    if (bfSubstDays.length > 0) {
      era.bfSubstDays  = bfSubstDays.length;
      era.bfSubstStart = bfSubstDays[0].date;
      era.bfSubstEnd   = bfSubstDays[bfSubstDays.length - 1].date;
      // Avg pump output on those days (partial — only what was pumped)
      const bfTotalOutput = bfSubstDays.reduce(function(s,d){return s+d.output;},0);
      era.bfSubstAvgPumpOutput = Math.round(bfTotalOutput / bfSubstDays.length);
    }
  });

  // -- 7. Compute transition deltas ---------------------------------------
  const transitions = [];
  for (let i = 1; i < epochs.length; i++) {
    const prev = epochs[i - 1], curr = epochs[i];
    const sessionDelta    = curr.sessionCount   - prev.sessionCount;
    const outputDelta     = curr.avgDailyOutput - prev.avgDailyOutput;
    const perSessionDelta = curr.outputPerSession - prev.outputPerSession;
    transitions.push({
      fromSessions:     prev.sessionCount,
      toSessions:       curr.sessionCount,
      transitionDate:   curr.startDate,
      sessionDelta:     sessionDelta,
      outputDelta:      outputDelta,
      perSessionDelta:  perSessionDelta,
      // Did the body compensate? If per-session output rose while daily output held steady
      compensated:      perSessionDelta > 0 && Math.abs(outputDelta) < 0.15 * prev.avgDailyOutput
    });
  }

  // -- 8. Human-readable summary ------------------------------------------
  const parts = epochs.map(e => `${e.sessionCount}×/day (${e.startDate}–${e.endDate}, ${e.dayCount} days)`);
  const evolutionSummary = parts.length > 1
    ? 'Schedule evolved: ' + parts.join(' → ')
    : (parts[0] || 'Single schedule period detected');

  return { epochs, currentEpoch, evolutionSummary, transitions };
}

function generateMedicalPrompt(metrics, babyConfig, medicalContext, dailyData, sessionsData) {
  // Calculate advanced metrics
  const trendAcceleration = calculateTrendAcceleration(dailyData);
  const recoveryRate = calculateRecoveryRate(dailyData);
  const hungerPattern = analyzeHungerPattern(dailyData);
  const weightGainPatterns = analyzeWeightGainPatterns(dailyData, babyConfig);
  const zScoreTrajectory = calculateZScoreTrajectory(dailyData, babyConfig);
  const pumpFrequency = analyzePumpFrequency(dailyData, sessionsData);
  const breastAsymmetry = analyzeBreastAsymmetry(dailyData);
  const asymmetryByTime = analyzeAsymmetryByTimeOfDay(dailyData, sessionsData);
  const slotDropout   = analyzeSessionDropCandidates(sessionsData, 14);
  const dowRhythm     = analyzeDayOfWeekRhythm(dailyData);
  const scheduleEvolution = detectScheduleEvolution(dailyData, sessionsData);
  const wflMetrics    = calculateWFLMetrics(dailyData, babyConfig);

  const weeklyTable = metrics.weeklyAverages.map(w =>
    `Week ${w.week} (${w.dateRange}): Production ${w.avgProduction}ml/day | Expr ${w.avgExpr}ml/day | Formula ${w.avgForm}ml/day | Formula-free ${w.formulaFreeDays}/${w.days} days`
  ).join('\n');

  const dataSection = `# BABY INFORMATION
- Name: ${babyConfig.name}
- Birth Date: ${babyConfig.birthDate.toISOString().split('T')[0]}
- Gestational Age at Birth: ${babyConfig.gestationalAge.weeks} weeks + ${babyConfig.gestationalAge.days} days (${babyConfig.gestationalAge.category})
- Current Age: ${metrics.currentAge.days} days (${metrics.currentAge.weeks} weeks, ${metrics.currentAge.months} months)

${medicalContext}

# COMPLETE HISTORICAL DATA - 7-DAY ROLLING AVERAGES BY WEEK

${weeklyTable}

# CURRENT STATUS SUMMARY (Last 14 Days: ${metrics.production.recentDateRange})

## Latest Anthropometric Measurements
- **Weight**: ${metrics.latestMeasurements.weight}
- **Height/Length**: ${metrics.latestMeasurements.height}${metrics.latestMeasurements.heightStats ? ` → ${metrics.latestMeasurements.heightStats}` : ''}
- **Head Circumference**: ${metrics.latestMeasurements.headCirc}${metrics.latestMeasurements.headCircStats ? ` → ${metrics.latestMeasurements.headCircStats}` : ''}
- **BMI**: ${metrics.latestMeasurements.bmiStats || metrics.latestMeasurements.bmi || 'No data'}
- Measurement Date: ${metrics.latestMeasurements.measurementDate}

## Recent Feeding & Production (Last 14 Days)
- Average daily production: ${metrics.production.recentAverage} ml/day
- Median production: ${metrics.production.recentMedian} ml/day
- Production range: ${metrics.production.recentMin} - ${metrics.production.recentMax} ml/day
- Standard deviation: ${metrics.production.recentStdDev} ml
- Total produced overall: ${metrics.production.total}
- Left/Right ratio (last 14 days): ${metrics.production.leftRightRatio}

## Recent Consumption (Last 14 Days: ${metrics.consumption.recentDateRange})
- Formula-free rate: ${metrics.consumption.formulaFreeRate} (${metrics.consumption.formulaFreeDays}/14 days)
- Average expressed milk consumed: ${metrics.consumption.averageExpr} ml/day
- Average formula consumed: ${metrics.consumption.averageForm} ml/day
- Total consumed per day: ${metrics.consumption.totalConsumed} ml
- Expressed milk percentage: ${metrics.consumption.exprPercent}
- Last formula date: ${metrics.consumption.lastFormulaDate || 'Never used formula'}
- Days since last formula: ${metrics.consumption.daysSinceLastFormula}
- First formula-free week achieved: ${metrics.consumption.firstFormulaFreeWeek || 'Not yet achieved'}

## Growth Trajectory
${metrics.growth.currentWeight ? `- Current weight: ${metrics.growth.currentWeight}
- Birth weight: ${metrics.growth.birthWeight}
- Total gain since birth: ${metrics.growth.totalGain}
- Average gain overall: ${metrics.growth.averageGainPerDay} (${metrics.growth.averageGainPerWeek})
- Recent velocity: ${metrics.growth.recentVelocity || 'N/A'} (${metrics.growth.recentVelocityDays || ''})
- Velocity trend (last 3 intervals): ${metrics.growth.velocityTrend || 'N/A'}
- Number of weight measurements: ${metrics.growth.measurements}

**All Weight Measurements:**
${metrics.growth.allMeasurements.join('\n')}` : '- Insufficient weight data for trend analysis'}

## Historical Trends (Entire Period)
- Production trend: ${metrics.historicalTrends.productionTrend}
- Peak production: ${metrics.historicalTrends.peakProduction.value} ml on ${metrics.historicalTrends.peakProduction.date}
- Lowest production: ${metrics.historicalTrends.lowestProduction.value < Infinity ? metrics.historicalTrends.lowestProduction.value + ' ml on ' + metrics.historicalTrends.lowestProduction.date : 'N/A'}
- Current formula-free streak: ${metrics.historicalTrends.currentFormulaFreeStreak} days
- Longest formula-free streak: ${metrics.historicalTrends.longestFormulaFreeStreak} days

## Circadian Patterns (Last 14 Days) — Actual Session Times
- Best session: ${metrics.patterns.bestSession ? metrics.patterns.bestSession.label + ' (' + metrics.patterns.bestSession.avgOutput + ' ml avg)' : 'N/A'}
- Lowest session: ${metrics.patterns.worstSession ? metrics.patterns.worstSession.label + ' (' + metrics.patterns.worstSession.avgOutput + ' ml avg)' : 'N/A'}
- Night sessions (9PM-6AM) average output: ${metrics.patterns.nightAvg} ml
- Day sessions (6AM-9PM) average output: ${metrics.patterns.dayAvg} ml
- Slot labels (12 AM, 3 AM, 6 AM … 9 PM) are bucket names only — the actual recorded pump time may be up to ~30 min from the label. A slot showing < 10 ml means it was effectively skipped that day.

**Pump Schedule History & Output Impact:**
${scheduleEvolution.evolutionSummary}
${scheduleEvolution.epochs.length > 0 ? scheduleEvolution.epochs.map(function(e, i) {
  var isCurrent = i === scheduleEvolution.epochs.length - 1;
  var gapDetail = '';
  if (e.slots && e.slots.length >= 2) {
    var hours = e.slots
      .map(function(s) { return s.actualHour !== undefined ? s.actualHour : null; })
      .filter(function(h) { return h !== null; })
      .sort(function(a, b) { return a - b; });
    var gaps = [];
    for (var gi = 1; gi < hours.length; gi++) {
      gaps.push(parseFloat((hours[gi] - hours[gi-1]).toFixed(1)));
    }
    var overnightGap = parseFloat((24 - hours[hours.length-1] + hours[0]).toFixed(1));
    var allGaps = gaps.concat([overnightGap]);
    var minG = Math.min.apply(null, allGaps).toFixed(1);
    var maxG = Math.max.apply(null, allGaps).toFixed(1);
    var sorted = allGaps.slice().sort(function(a,b){return a-b;});
    var medG = sorted[Math.floor(sorted.length/2)].toFixed(1);
    var gapSeq = gaps.map(function(g){return g+'h';}).join(', ') + ' (+ ' + overnightGap + 'h overnight)';
    gapDetail = '    Actual gaps: ' + gapSeq + ' | min=' + minG + 'h, median=' + medG + 'h, max=' + maxG + 'h';
  }

  function fmtHour(h) {
    h = ((h % 24) + 24) % 24;
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60), adj = hh;
    if (mm === 60) { mm = 0; adj = (adj + 1) % 24; }
    var p = adj < 12 ? 'AM' : 'PM', d = adj % 12 === 0 ? 12 : adj % 12;
    return d + ':' + (mm < 10 ? '0' : '') + mm + ' ' + p;
  }

  var slotDetail = e.slots && e.slots.length > 0
    ? e.slots.map(function(s) {
        var actualStr = s.actualHour !== undefined
          ? ' (actual median: ' + fmtHour(s.actualHour) + ')'
          : '';
        return '    • ' + s.slot + actualStr + ': ~' + s.avgOutput + ' ml avg';
      }).join('\n')
    : '    (slot detail unavailable)';

  var outputSummary = (e.avgDailyOutput !== undefined)
    ? ' | avg ' + e.avgDailyOutput + 'ml/day, ' + e.outputPerSession + 'ml/session'
    : '';
  var bfNote = e.bfSubstDays
    ? '\n    [Direct BF attempt period: ' + e.bfSubstStart + ' – ' + e.bfSubstEnd +
      ' (' + e.bfSubstDays + ' days where pump sessions were replaced by direct feeds.' +
      ' Avg pumped output on those days: ' + e.bfSubstAvgPumpOutput + 'ml — remainder likely consumed directly.' +
      ' These days excluded from era output average above.]'
    : '';
  return '  Era ' + (i+1) + (isCurrent ? ' ← CURRENT' : '') + ': ' + e.sessionCount + ' sessions/day' + outputSummary + ' | ' + e.startDate + ' – ' + e.endDate + ' (' + e.dayCount + ' days)\n' + slotDetail + (gapDetail ? '\n' + gapDetail : '') + bfNote;
}).join('\n') : '  (epoch data unavailable)'}

${scheduleEvolution.transitions && scheduleEvolution.transitions.length > 0 ? (function() {
  var lines = ['\nTransition analysis (what happened to supply at each session count change):'];
  scheduleEvolution.transitions.forEach(function(t) {
    var direction = t.sessionDelta < 0 ? 'dropped' : 'added';
    var outputStr = t.outputDelta >= 0
      ? '+' + t.outputDelta + 'ml/day'
      : t.outputDelta + 'ml/day';
    var perSessStr = t.perSessionDelta >= 0
      ? '+' + t.perSessionDelta + 'ml/session'
      : t.perSessionDelta + 'ml/session';
    var comp = t.compensated ? ' [body compensated: per-session output rose to maintain total]' : '';
    lines.push(
      '  ' + t.fromSessions + '→' + t.toSessions + ' sessions (' + t.transitionDate + '): ' +
      'daily output ' + outputStr + ', per-session ' + perSessStr + comp
    );
  });
  return lines.join('\n');
})() : ''}


**Clinical context for schedule:** The mother arrived at each schedule through direct experience — each reduction was made at her tolerance threshold (no lumps, no discomfort). When suggesting further reductions, use the Session Drop / Merge Candidates table above: it ranks slots by safety for removal based on this specific data.

**Session-by-Session Detail (Last 14 Days, chronological):**
${metrics.patterns.sessions.map(s =>
  `- ${s.label}: avg ${s.avgOutput}ml (L:${s.avgLeft}/R:${s.avgRight}), present ${s.presenceRate}% of days`
).join('\n')}

**Gap Summary:**
- Total canonical sessions/day: ${slotDropout.summary ? slotDropout.summary.totalSessions : 'N/A'}
- Current uniform spacing: ${slotDropout.summary ? slotDropout.summary.currentSpacingH + 'h' : 'N/A'}
- Spacing after dropping one session (even redistribution): ${slotDropout.summary ? slotDropout.summary.redistributedGapH + 'h' : 'N/A'}
- Median gap between sessions (current): ${slotDropout.summary ? slotDropout.summary.medianGapHours + 'h' : 'N/A'}
- Longest current gap: ${slotDropout.summary ? slotDropout.summary.longestGapHours + 'h (' + slotDropout.summary.longestGapSpan + ')' : 'N/A'}

## Session Drop / Merge Candidates (Last 14 Days)
Ranked safest to modify first. Use this table directly when building the pump reduction plan.
Redistribution model: dropping a session means the remaining N-1 sessions spread evenly across 24 h — the uniform spacing after a drop is shown as "redistributed gap". The raw local hole (gapBefore + gapAfter at that spot) is shown for reference only and is NOT the basis for the verdict.
Verdicts: drop = redistributed gap is safe (<5h); merge = two close sessions can combine at midpoint; caution = borderline redistributed gap (5-6.5h); keep = redistributed gap would be unsafe (>6.5h).
${slotDropout.candidates.map(c =>
  `- [${c.verdict.toUpperCase()}] ${c.label}: avg ${c.avgOutput}ml, redistributed gap: ${c.redistributedGap}h (${c.gapFlag}), raw local hole: ${c.gapIfDropped}h, saves 30min/day${c.note ? ' | ' + c.note : ''}`
).join('\n')}

## Session Analysis (Entire Period)
- Total sessions recorded: ${metrics.sessionAnalysis.totalSessions}
- Average sessions per day: ${metrics.sessionAnalysis.avgSessionsPerDay}
- Most frequent session time: ${metrics.sessionAnalysis.mostFrequentTimeSlot}
- Average pump per session: ${metrics.sessionAnalysis.avgPumpPerSession} ml
- Average feed per session: ${metrics.sessionAnalysis.avgFeedPerSession} ml

## Per-Slot Feed Volume Analysis (Last 21 Days)
${(() => {
  const psa = metrics.perSlotFeedAnalysis;
  if (!psa) return '- Insufficient session data for per-slot analysis';
  const lines = [
    `- Analysis period: last ${psa.periodDays} days`,
    `- Overall avg feed per session: ${psa.overallAvgFeedPerSession} ml (across ${psa.totalFeedSessions} feed sessions)`,
    '',
    '### Per Time-Slot Breakdown',
    '| Slot | Count | Avg (ml) | Median (ml) | Min | Max | Partial-feed rate (≤20ml) | Typical actual time |',
    '|------|-------|----------|-------------|-----|-----|--------------------------|---------------------|',
    ...psa.slotStats.map(s =>
      `| ${s.slot} | ${s.count} | ${s.avg} | ${s.median} | ${s.min} | ${s.max} | ${s.partialRate}% | ${s.medianActualTime || 'varies'} |`
    ),
    '',
    '### Wastage-Risk Slots (partial-feed rate ≥30%)',
    psa.wastageRiskSlots.length > 0
      ? psa.wastageRiskSlots.map(s => `- ${s.slot}: ${s.partialRate}% partial-feed rate, median intake only ${s.median} ml`).join('\n')
      : '- None identified',
    '',
    '### Optimized Feeding Schedule Recommendation (derived from last 21 days)',
    '| Slot | Recommended Time | Recommended Offer Volume | Rationale |',
    '|------|-----------------|--------------------------|-----------|',
    ...psa.optimizedSchedule.map(s =>
      `| ${s.slot} | ${s.recommendedTime} | ${s.recommendedVolume} ml | ${s.rationale} |`
    )
  ];
  return lines.join('\n');
})()}

## Detected Anomalies
${metrics.anomalies.length > 0 ? metrics.anomalies.map(a => `- ${a.type} on ${a.date}: ${a.value} (${a.reason})`).join('\n') : '- None detected'}

# ADVANCED ANALYTICS

## Trend Acceleration Analysis
**Current Acceleration**: ${trendAcceleration.current || 'N/A'} ml/week^2
*(Positive = production growth is speeding up; negative = slowing down; near zero = steady rate)*

${trendAcceleration.recentVelocities ? `Recent Velocities (week-over-week changes):
${trendAcceleration.recentVelocities.join('\n')}` : ''}

${trendAcceleration.recentAccelerations ? `Recent Accelerations (rate of velocity change):
${trendAcceleration.recentAccelerations.join('\n')}` : ''}

*Derive clinical status and interpretation directly from the acceleration value and velocity trends above.*

## Supply Recovery Rate
**Total Significant Drops (>20% below 7-day baseline)**: ${recoveryRate.totalDrops || 0}
**Recovered Drops**: ${recoveryRate.recoveredDrops || 0}
**Average Recovery Time**: ${recoveryRate.averageRecoveryDays || 'N/A'} days

${recoveryRate.drops && recoveryRate.drops.length > 0 ? `Drop Details:
${recoveryRate.drops.map(d =>
    `- ${d.date}: ${d.dropPercent}% drop (${d.actual}ml vs ${d.baseline}ml baseline) -> ${d.recovered ? `Recovered in ${d.recoveryDays} days` : 'Not yet recovered'}`
).join('\n')}` : '- No significant production drops detected'}

*Derive resilience rating and clinical interpretation directly from the drop count, recovery times, and recovery rate above.*

## Hunger Pattern Analysis
**Current Average Consumption**: ${hungerPattern.currentAverage || 'N/A'} ml/day
**Recent Range**: ${hungerPattern.recentRange || 'N/A'}
**Overall Growth Rate**: ${hungerPattern.growthRate || 'N/A'}% (first week → last week)
**Predictability**: ${hungerPattern.predictability ? hungerPattern.predictability.replace(/_/g, ' ') : 'N/A'} (CV: ${hungerPattern.coefficientOfVariation || 'N/A'}%)
**Trend**: ${hungerPattern.trend || 'N/A'}

**Consumption History by Era:**
${hungerPattern.eras && hungerPattern.eras.length > 0
  ? hungerPattern.eras.map(function(e, i) {
      var isCurrent = i === hungerPattern.eras.length - 1;
      var formNote = e.avgForm > 0 ? ' (incl. ' + e.avgForm + 'ml formula/day)' : ' (breastmilk only)';
      return '  Era ' + (i+1) + (isCurrent ? ' ← CURRENT' : '') + ': avg ' + e.avgConsumption + 'ml/day' + formNote + ' | ' + e.startDate + ' – ' + e.endDate + ' (' + e.dayCount + ' days)';
    }).join('\n')
  : '  (era data unavailable)'}

**Consumption Transitions (when demand shifted):**
${hungerPattern.transitions && hungerPattern.transitions.length > 0
  ? hungerPattern.transitions.map(function(t) {
      var sign = t.delta >= 0 ? '+' : '';
      return '  ' + t.transitionDate + ': ' + t.fromAvg + '→' + t.toAvg + 'ml/day (' + sign + t.delta + 'ml, ' + sign + t.pct + '%) — ' + t.magnitude + ' ' + t.direction;
    }).join('\n')
  : '  (no significant transitions detected)'}

## Weight Gain Patterns
**Total Weight Measurements**: ${weightGainPatterns.totalMeasurements || 0}
**Current Velocity Trend**: ${weightGainPatterns.currentTrend ? weightGainPatterns.currentTrend.replace(/_/g, ' ') : 'N/A'}
**Overall Acceleration Trend**: ${weightGainPatterns.overallAccelTrend ? weightGainPatterns.overallAccelTrend.replace(/_/g, ' ') : 'N/A'}
**Latest WHO Adequacy**: ${weightGainPatterns.adequacyStatus ? weightGainPatterns.adequacyStatus.replace(/_/g, ' ') : 'N/A'}

${weightGainPatterns.allVelocities ? `All Velocity Intervals:
${weightGainPatterns.allVelocities.map(v =>
    `- ${v.fromDate} to ${v.toDate} (${v.interval} days): ${v.gPerWeek} g/week [${v.adequacy}] (WHO: ${v.whoRange})`
).join('\n')}` : ''}

${weightGainPatterns.patterns && weightGainPatterns.patterns.length > 0 ? `Significant Pattern Changes (>20% velocity shift):
${weightGainPatterns.patterns.map(p =>
    `- ${p.period}: ${p.type} of ${p.change} g/week (${p.changePercent}%)`
).join('\n')}` : ''}

*Derive clinical interpretation — distinguishing catch-up growth from concerning deceleration — directly from the velocity intervals and pattern change data above.*

## Z-Score Trajectory
**First Z-Score**: ${zScoreTrajectory.firstZScore || 'N/A'} SD
**Current Z-Score**: ${zScoreTrajectory.currentZScore || 'N/A'} SD
**Current Percentile**: ${zScoreTrajectory.currentPercentile || 'N/A'}th
**Total Change**: ${zScoreTrajectory.totalChange || 'N/A'} SD
**Overall Direction**: ${zScoreTrajectory.overallDirection ? zScoreTrajectory.overallDirection.replace(/_/g, ' ') : 'N/A'}
**Current Category**: ${zScoreTrajectory.currentCategory ? zScoreTrajectory.currentCategory.replace(/_/g, ' ') : 'N/A'}

${zScoreTrajectory.allMeasurements ? `Complete Z-Score History:
${zScoreTrajectory.allMeasurements.map(m =>
    `- Day ${m.days} (${m.date}): ${m.weight} kg -> Z-score ${m.zScore} (${m.percentile}th percentile)`
).join('\n')}` : ''}

${zScoreTrajectory.changes ? `Z-Score Changes Between Measurements:
${zScoreTrajectory.changes.map(c =>
    `- ${c.fromDate} to ${c.toDate}: ${c.fromZ} -> ${c.toZ} SD (${c.direction}, ${c.change})`
).join('\n')}` : ''}

*Derive clinical interpretation of Z-score trajectory — including direction, significance, and prognosis — directly from the Z-score history and interval changes above.*

## Pump Frequency & Supply Correlation
**Recent Median Frequency**: ${pumpFrequency.recentMedianFreq || 'N/A'} sessions/day (14-day median)
**Recent Average Output**: ${pumpFrequency.recentAvgOutput || 'N/A'} ml/day (14-day avg)
**Output per Session**: ${pumpFrequency.outputPerSession || 'N/A'} ml/session
**Frequency Trend**: ${pumpFrequency.freqChange > 0 ? '+' : ''}${pumpFrequency.freqChange || 'N/A'}% (first week -> last week)

${pumpFrequency.lagAnalysis ? `Lag Correlation Analysis (How frequency changes affect output):
${pumpFrequency.lagAnalysis.map(lag =>
    `- ${lag.lag}-day lag: ${(lag.correlation * 100).toFixed(1)}% correlation (${lag.strength}) - ${lag.dataPoints} data points`
).join('\n')}

**Optimal Response Lag**: ${pumpFrequency.bestLag ? `${pumpFrequency.bestLag.lag} days (${(pumpFrequency.bestLag.correlation * 100).toFixed(1)}% correlation - ${pumpFrequency.bestLag.strength.toLowerCase()})` : 'N/A'}` : ''}

${pumpFrequency.allData && pumpFrequency.allData.length > 0 ? `
Recent Frequency Timeline (last 7 days):
${pumpFrequency.allData.slice(-7).map(d =>
    `- ${d.date}: ${d.sessions} sessions, ${d.avgFrequency} avg/day, ${d.totalOutput}ml output, ${d.avgOutput}ml avg`
).join('\n')}` : ''}

*Derive clinical interpretation of frequency-output relationship and actionable recommendations directly from the lag correlation data and frequency trend above.*

## Breast Asymmetry Analysis
**Dominant Breast**: ${breastAsymmetry.dominant || 'N/A'}
**Asymmetry Percentage**: ${breastAsymmetry.asymmetryPercent || 'N/A'}%
**Left/Right Ratio**: ${breastAsymmetry.overallRatio || 'N/A'}
**Total Production**: Left ${breastAsymmetry.totalLeft || 0}ml, Right ${breastAsymmetry.totalRight || 0}ml (difference: ${breastAsymmetry.difference || 0}ml)

**Trend Analysis**:
- First week: Left ${breastAsymmetry.firstWeekAvg?.left || 'N/A'}ml, Right ${breastAsymmetry.firstWeekAvg?.right || 'N/A'}ml (${breastAsymmetry.firstWeekAvg?.asymmetry || 'N/A'}% asymmetry)
- Last week: Left ${breastAsymmetry.lastWeekAvg?.left || 'N/A'}ml, Right ${breastAsymmetry.lastWeekAvg?.right || 'N/A'}ml (${breastAsymmetry.lastWeekAvg?.asymmetry || 'N/A'}% asymmetry)
- Asymmetry trend: ${breastAsymmetry.trendDirection || 'N/A'} (${breastAsymmetry.asymmetryTrend || 'N/A'}% change)

**Consistency Category**: ${breastAsymmetry.consistency ? breastAsymmetry.consistency.replace(/_/g, ' ') : 'N/A'} (coefficient of variation: ${breastAsymmetry.coefficientOfVariation || 'N/A'}%)

${breastAsymmetry.recentDays && breastAsymmetry.recentDays.length > 0 ? `
Recent Daily Breakdown (last 14 days):
${breastAsymmetry.recentDays.map(d =>
    `- ${d.date}: L=${d.left}ml, R=${d.right}ml, diff=${d.difference}ml (${d.dominant} dominant)`
).join('\n')}` : ''}

## Asymmetry by Time of Day
**Time Dependency Category**: ${asymmetryByTime.timeDependent ? asymmetryByTime.timeDependent.replace(/_/g, ' ') : 'N/A'}
**Average Asymmetry**: ${asymmetryByTime.avgAsymmetry || 'N/A'}%
**Variability**: ${asymmetryByTime.asymmetryVariability || 'N/A'}%

${asymmetryByTime.byTimeSlot && asymmetryByTime.byTimeSlot.length > 0 ? `
By Time Slot:
${asymmetryByTime.byTimeSlot.map(slot =>
    `- ${slot.timeSlot}: L=${slot.avgLeft}ml, R=${slot.avgRight}ml, asymmetry=${slot.asymmetry}% (${slot.dominant} dominant, ${slot.sessions} sessions)`
).join('\n')}

**Most Asymmetric Slot**: ${asymmetryByTime.mostAsymmetric?.timeSlot || 'N/A'} (${asymmetryByTime.mostAsymmetric?.asymmetry || 'N/A'}%)
**Least Asymmetric Slot**: ${asymmetryByTime.leastAsymmetric?.timeSlot || 'N/A'} (${asymmetryByTime.leastAsymmetric?.asymmetry || 'N/A'}%)` : ''}

*Derive clinical interpretation of breast asymmetry pattern and any time-of-day significance directly from the slot-by-slot data above.*

## Weight-for-Length (WFL) Analysis
**Why WFL matters more than BMI in infancy:**
WFL compares weight to length independently of age, directly indicating whether the child's
weight is appropriate for their current body size. It is the primary WHO indicator for acute
malnutrition and overweight in children under 2, and is preferred over BMI in this age group.

**Measurement count**: ${wflMetrics.measurementCount || 0}
**Current length**: ${wflMetrics.currentLength || 'N/A'} cm
**Current weight**: ${wflMetrics.currentWeight || 'N/A'} kg
**Current WFL Z-score**: ${wflMetrics.currentZScore !== null ? wflMetrics.currentZScore + ' SD' : 'N/A'}
**Current WFL Percentile**: ${wflMetrics.currentPercentile !== null ? wflMetrics.currentPercentile + 'th' : 'N/A'}
**WHO 50th percentile weight at this length**: ${wflMetrics.currentWho50 ? wflMetrics.currentWho50.toFixed(2) + ' kg' : 'N/A'}
**Clinical category**: ${wflMetrics.category ? wflMetrics.category.replace(/_/g, ' ') : 'N/A'}
**Overall trajectory**: ${wflMetrics.overallDirection ? wflMetrics.overallDirection.replace(/_/g, ' ') : 'N/A'}
**Z-score change (first to last measurement)**: ${wflMetrics.totalZChange !== null ? wflMetrics.totalZChange + ' SD' : 'N/A'}

**All WFL Measurements:**
${wflMetrics.allMeasurements && wflMetrics.allMeasurements.length > 0
  ? wflMetrics.allMeasurements.map(m =>
      `- ${m.date}: ${m.length} cm → ${m.weight} kg | Z=${m.zScore !== null ? m.zScore : 'N/A'} SD (${m.percentile !== null ? m.percentile + 'th' : 'N/A'} pct) | WHO 50th at this length: ${m.who50 ? m.who50.toFixed(2) + ' kg' : 'N/A'}`
    ).join('\n')
  : '- No paired weight+length measurements available'}

**Interval Z-score changes:**
${wflMetrics.changes && wflMetrics.changes.length > 0
  ? wflMetrics.changes.map(c =>
      `- ${c.fromDate} (${c.fromLength}cm) to ${c.toDate} (${c.toLength}cm): Z ${c.fromZ} to ${c.toZ} (delta ${c.deltaZ !== null ? (c.deltaZ >= 0 ? '+' : '') + c.deltaZ : 'N/A'}) — ${c.direction}`
    ).join('\n')
  : '- Insufficient data for interval analysis'}

*Clinical interpretation notes:*
*- Normal WFL: Z > -2 and Z < +2 | Wasted: Z < -2 | Severely wasted: Z < -3*
*- Possible overweight: Z > +2 | Overweight: Z > +3*
*- A declining WFL Z-score during a period of rapid linear growth is physiologically normal — the child is gaining height faster than weight. Distinguish this from true wasting by checking absolute weight gain velocity alongside the WFL trend.*
*- Do NOT rely on BMI alone for infants under 2 — always interpret WFL as the primary body composition indicator.*

## Day-of-Week Production & Consumption Rhythm (All-Time)
**Peak production day**: ${dowRhythm.peakProductionDay} — ${dowRhythm.peakProductionValue} ml avg
**Trough production day**: ${dowRhythm.troughProductionDay} — ${dowRhythm.troughProductionValue} ml avg
**Production swing across the week**: ${dowRhythm.productionRangeMl} ml (${dowRhythm.productionVariationPct}% coefficient of variation)
**Peak consumption day**: ${dowRhythm.peakConsumptionDay} — ${dowRhythm.peakConsumptionValue} ml avg
**Trough consumption day**: ${dowRhythm.troughConsumptionDay} — ${dowRhythm.troughConsumptionValue} ml avg
**Best surplus day**: ${dowRhythm.bestSurplusDay} (+${dowRhythm.bestSurplusValue} ml)
**Worst supply-demand gap day**: ${dowRhythm.worstGapDay} (${dowRhythm.worstGapValue} ml — ${dowRhythm.worstGapValue < 0 ? 'deficit' : 'surplus'})
**Does baby consumption track maternal production rhythm?** ${dowRhythm.consumptionTracksProduction.replace(/_/g, ' ')} (Spearman r=${dowRhythm.spearmanRankCorrelation})

All-Time Day-of-Week Averages:
${dowRhythm.allTime.map(function(d) {
  return d.day + ': prod=' + d.avgProduction + 'ml, consume=' + d.avgConsumption + 'ml, gap=' + (d.gap >= 0 ? '+' : '') + d.gap + 'ml, formula=' + d.avgFormula + 'ml (n=' + d.count + ' days)';
}).join('\n')}

Recent 28-Day Averages:
${dowRhythm.recent28.map(function(d) {
  return d.day + ': prod=' + d.avgProduction + 'ml, consume=' + d.avgConsumption + 'ml, gap=' + (d.gap >= 0 ? '+' : '') + d.gap + 'ml (n=' + d.count + ' days)';
}).join('\n')}

*Use the all-time data for the chart bars (most representative sample). Use recent-28-day data for any trend shift commentary. The bar chart MUST be built from the all-time values — do not use recent-28 values for bar widths.*

`;

  const parts = [PROMPT.PERSONA, dataSection, PROMPT.taskGuide(babyConfig), PROMPT.HTML_FORMAT_RULES];
  const omit = blocksToOmit(detectFeedingMode(dailyData, babyConfig));
  if (omit.length) {
    parts.push(
      `# FEEDING MODE\nThis baby is ${detectFeedingMode(dailyData, babyConfig)}-fed, so the following blocks do not apply. ` +
      `Still include each key, but set its value to an empty string (""): ${omit.join(', ')}.`
    );
  }
  return parts.join('\n\n');
}

/** Auto-detect feeding mode from the data; a Setup `feedingMode` override wins. */
function detectFeedingMode(dailyData, babyConfig) {
  const override = babyConfig && babyConfig.feedingMode;
  if (override && override !== 'auto') return override;
  let hasFormula = false, hasMilk = false;
  for (const d of dailyData) {
    if (Number(d.form) > 0) hasFormula = true;
    if (Number(d.expr) > 0 || Number(d.pumpLeft) > 0 || Number(d.pumpRight) > 0) hasMilk = true;
  }
  if (hasFormula && !hasMilk) return 'formula-only';
  if (!hasFormula && hasMilk) return 'breastfeeding-only';
  return 'combination';
}

/** Block keys that do not apply to a given feeding mode (kept in sync with the UI). */
function blocksToOmit(mode) {
  if (mode === 'formula-only') {
    return [
      'block_production_consumption', 'block_supply_stability', 'block_daily_production',
      'block_circadian_optimization', 'block_trend_acceleration', 'block_recovery_resilience',
      'block_pump_frequency', 'block_dow_rhythm', 'block_pump_reduction', 'block_topup_tapering',
    ];
  }
  if (mode === 'breastfeeding-only') {
    return ['block_topup_tapering'];
  }
  return [];
}

const SYSTEM_INSTRUCTION =
  'You are a pediatric medical expert specializing in infant feeding, lactation, and growth analysis. You provide evidence-based clinical interpretations.';

async function callGemini(prompt) {
  const apiKey = CONFIG.apiKey;

  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('GEMINI_API_KEY environment variable is not set. Run: export GEMINI_API_KEY=your-key');
  }

  console.log('Sending request to Gemini...');
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Prompt length: ${prompt.length} characters\n`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 32768,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  const candidate = data.candidates && data.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    const reason = candidate && candidate.finishReason ? ` (finishReason: ${candidate.finishReason})` : '';
    const blocked = data.promptFeedback && data.promptFeedback.blockReason
      ? ` (blockReason: ${data.promptFeedback.blockReason})` : '';
    throw new Error(`Gemini returned no content${reason}${blocked}`);
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn(`⚠️  Gemini finishReason: ${candidate.finishReason} — output may be truncated. Try a larger model via GEMINI_MODEL.`);
  }

  const usage = data.usageMetadata || {};
  console.log('Response received');
  console.log(`Tokens used: ${usage.totalTokenCount ?? '?'} (prompt: ${usage.promptTokenCount ?? '?'}, output: ${usage.candidatesTokenCount ?? '?'})\n`);

  return candidate.content.parts.map((p) => p.text || '').join('');
}

function parseAndValidateJSON(aiResponse) {
  let jsonText = aiResponse.trim();

  const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${e.message}\n\nResponse:\n${aiResponse}`);
  }

  const requiredBlocks = [
    'block_executive_summary', 'block_daily_production', 'block_production_consumption',
    'block_supply_stability', 'block_circadian_pattern', 'block_feeding_strategy',
    'block_topup_tapering', 'block_velocity_interpretation', 'block_weight_progression',
    'block_velocity', 'block_height_hc', 'block_bmi', 'block_weight_for_length',
    'block_integrated_summary', 'block_monitoring_recommendations',
    'block_medical_assessment', 'block_circadian_optimization',
    'block_trend_acceleration', 'block_recovery_resilience', 'block_hunger_patterns',
    'block_weight_gain_patterns', 'block_zscore_trajectory', 'block_pump_frequency',
    'block_pump_reduction',
    'block_developmental_transitions',
    'block_solids',
    'block_dow_rhythm'
  ];

  // block_measurement_anomalies is conditional (anomaly block — the prompt spec says block_bmi replaces it
  // when there are no anomalies). Validate that at least one of the two is present.
  if (!parsed['block_measurement_anomalies'] && !parsed['block_bmi']) {
    throw new Error('Missing required block: either block_measurement_anomalies or block_bmi must be present');
  }

  const missing = requiredBlocks.filter(block => !parsed[block]);
  if (missing.length > 0) {
    throw new Error(`Missing required blocks: ${missing.join(', ')}`);
  }

  return parsed;
}

function saveInferenceJSON(inferenceData) {
  const outputDir = path.dirname(CONFIG.outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonString = JSON.stringify(inferenceData, null, 2);
  fs.writeFileSync(CONFIG.outputPath, jsonString, 'utf8');
}

function copyToClipboard(text) {
  const { execSync } = require('child_process');
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (platform === 'win32') {
      execSync('clip', { input: text });
    } else {
      // Linux — try xclip then xsel
      try {
        execSync('xclip -selection clipboard', { input: text });
      } catch {
        execSync('xsel --clipboard --input', { input: text });
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  try {
    const { dailyData, sessionsData, babyConfig, medicalContext } = loadAllData();
    const metrics = calculateMetrics(dailyData, sessionsData, babyConfig);
    const prompt = generateMedicalPrompt(metrics, babyConfig, medicalContext, dailyData, sessionsData);

    // Step 1: Copy prompt to clipboard
    const copied = copyToClipboard(prompt);
    if (copied) {
      console.log('✅  Prompt copied to clipboard.');
      console.log(`    Length: ${prompt.length.toLocaleString()} characters`);
    } else {
      console.log('⚠️  Could not copy to clipboard automatically.');
    }

    // Step 2: Call Gemini — or, in manual mode, print the prompt and stop.
    const apiKey = CONFIG.apiKey;
    const haveKey = apiKey && apiKey !== 'your-api-key-here';
    const mode = CONFIG.mode === 'ai' || CONFIG.mode === 'manual' ? CONFIG.mode : haveKey ? 'ai' : 'manual';
    if (mode === 'ai' && !haveKey) {
      console.log('\n⚠️  INFERENCE_MODE=ai but no GEMINI_API_KEY set — falling back to manual mode.');
    }
    if (mode === 'manual' || !haveKey) {
      console.log('\n-------- MANUAL MODE --------');
      console.log('The analysis prompt has been copied to your clipboard and is printed below.');
      console.log('  1. Paste it into an LLM (ChatGPT, Claude, etc.).');
      console.log('  2. Copy the JSON object the model returns.');
      console.log(`  3. Replace the contents of ${CONFIG.outputPath} with that JSON.`);
      console.log('Until then, the dashboard keeps the existing inference.json.\n');
      console.log('-------------------------- PROMPT --------------------------\n');
      console.log(prompt);
      console.log('\n------------------------ END PROMPT ------------------------');
      return;
    }

    try {
      console.log('\n🤖  Connecting to Gemini...');
      const aiResponse = await callGemini(prompt);
      const inferenceData = parseAndValidateJSON(aiResponse);
      saveInferenceJSON(inferenceData);
      console.log(`✅  inference.json updated → ${CONFIG.outputPath}`);
    } catch (aiError) {
      console.warn(`\n⚠️  Gemini call failed: ${aiError.message}`);
      if (fs.existsSync(CONFIG.outputPath)) {
        console.log('    Using existing inference.json as fallback.');
      } else {
        console.warn('    No existing inference.json found — inferences will be empty.');
      }
    }

  } catch (error) {
    console.error('\nERROR:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, generateMedicalPrompt, calculateMetrics, calculateTrendAcceleration, calculateRecoveryRate, analyzeHungerPattern, analyzeWeightGainPatterns, calculateZScoreTrajectory, analyzePumpFrequency, analyzeBreastAsymmetry, analyzeAsymmetryByTimeOfDay, deriveCanonicalSessions, deriveSlotBasedSessions, analyzeSessionDropCandidates, analyzeDayOfWeekRhythm, detectScheduleEvolution, analyzePerSlotFeedVolumes };
