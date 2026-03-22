// Multi-client scanner configuration registry

export interface ScannerConfig {
  slug: string;
  name: string;
  prospectsTable: string;
  queueTable: string;
  keywords: string[];
  placeTypes: string[];
  chains: Set<string>;
  disqualifyNames: RegExp[];
  requireWebsite: boolean;
  skipEmailEnrichment: boolean;
  storeWebsiteUrl: boolean;
  storePlaceTypes: boolean;
  centerCity: { name: string; lat: number; lng: number };
  radiusMeters: number;
  maxResultsPerRun: number;
  coords: Record<string, { lat: number; lng: number }>;
}

const PINEY_WEB_CHAINS = new Set([
  "McDonald's", "Subway", "Domino's", "Pizza Hut", "KFC", "Taco Bell",
  "Burger King", "Wendy's", "Chick-fil-A", "Sonic", "Whataburger", "Starbucks",
  "Dunkin", "Dairy Queen", "Jack in the Box", "Popeyes", "Raising Cane's",
  "Wingstop", "Slim Chickens",
  "Walmart", "Walgreens", "CVS", "Dollar General", "Dollar Tree", "Family Dollar",
  "7-Eleven", "Circle K", "Hobby Lobby", "Michaels", "Tuesday Morning",
  "Burlington", "Ross", "TJ Maxx", "Marshalls", "Bealls",
  "Shell", "Exxon", "Chevron", "Marathon", "O'Reilly", "AutoZone", "NAPA",
  "Advance Auto", "Christian Brothers", "Take 5 Oil Change", "Valvoline", "Mavis",
  "H&R Block", "Edward Jones", "State Farm", "Allstate", "RE/MAX",
  "Keller Williams", "Century 21", "Chase", "Wells Fargo", "Bank of America",
  "Regions Bank", "Truist", "US Bank", "Citizens National Bank",
  "AEP", "SWEPCO", "Oncor", "Entergy", "AT&T", "Spectrum", "Suddenlink", "CenterPoint",
  "DaVita", "Concentra", "AFC Urgent Care", "CareNow",
]);

// Sip Society chains — same as Piney Web but KEEP hotel chains (they have event spaces)
const SIP_SOCIETY_CHAINS = new Set([
  "McDonald's", "Subway", "Domino's", "Pizza Hut", "KFC", "Taco Bell",
  "Burger King", "Wendy's", "Chick-fil-A", "Sonic", "Whataburger", "Starbucks",
  "Dunkin", "Dairy Queen", "Jack in the Box", "Popeyes",
  "Walmart", "Walgreens", "CVS", "Dollar General", "Dollar Tree", "Family Dollar",
  "7-Eleven", "Circle K", "AutoZone", "O'Reilly", "Advance Auto",
  "Shell", "Exxon", "Chevron", "Valero", "Murphy USA",
  "AT&T", "T-Mobile", "Verizon",
  "State Farm", "Allstate", "GEICO", "Progressive", "Farmers Insurance",
  "Wells Fargo", "Chase", "Bank of America", "Regions Bank", "Capital One",
  "Lowe's", "Home Depot", "Ace Hardware", "Harbor Freight",
  "Goodwill", "Salvation Army",
]);

const SIP_SOCIETY_DISQUALIFY: RegExp[] = [
  /funeral|mortuary|cemetery/i,
  /hospital|medical center|urgent care|emergency room/i,
  /police|sheriff|fire department/i,
  /city of |county clerk|county tax|courthouse/i,
  /\bISD\b|school district|elementary|middle school|high school/i,
  /pawn|bail bond|title loan|check cash/i,
];

// Church filter: disqualify UNLESS name also contains event-related words
function isSipSocietyChurchDisqualified(name: string): boolean {
  const lower = name.toLowerCase();
  const isChurch = /church|baptist|methodist|assembly of god|catholic|pentecostal|lutheran|presbyterian/i.test(lower);
  if (!isChurch) return false;
  const isEventVenue = /event center|event space|venue|reception|banquet/i.test(lower);
  return !isEventVenue;
}

// Clinic filter: disqualify UNLESS name also contains wedding/event/bridal
function isSipSocietyClinicDisqualified(name: string): boolean {
  const lower = name.toLowerCase();
  if (!/clinic/i.test(lower)) return false;
  return !/wedding|event|bridal/i.test(lower);
}

export function isSipSocietyDisqualified(name: string): boolean {
  if (SIP_SOCIETY_DISQUALIFY.some(re => re.test(name))) return true;
  if (isSipSocietyChurchDisqualified(name)) return true;
  if (isSipSocietyClinicDisqualified(name)) return true;
  return false;
}

const TX_COORDS: Record<string, { lat: number; lng: number }> = {
  longview: { lat: 32.5007, lng: -94.7405 }, tyler: { lat: 32.3513, lng: -95.3011 },
  nacogdoches: { lat: 31.6035, lng: -94.6552 }, marshall: { lat: 32.5449, lng: -94.3674 },
  kilgore: { lat: 32.3885, lng: -94.8769 }, henderson: { lat: 32.1532, lng: -94.7996 },
  lufkin: { lat: 31.3382, lng: -94.7291 }, texarkana: { lat: 33.4251, lng: -94.0477 },
  jacksonville: { lat: 31.9638, lng: -95.2702 }, shreveport: { lat: 32.5252, lng: -93.7502 },
  gilmer: { lat: 32.7288, lng: -94.9427 }, gladewater: { lat: 32.5365, lng: -94.9427 },
  pittsburg: { lat: 32.9954, lng: -94.9658 }, jefferson: { lat: 32.7574, lng: -94.3516 },
  carthage: { lat: 32.1571, lng: -94.3374 }, whitehouse: { lat: 32.2268, lng: -95.2157 },
  lindale: { lat: 32.5160, lng: -95.4094 }, bullard: { lat: 32.1291, lng: -95.3202 },
  "mount pleasant": { lat: 33.1568, lng: -94.9685 }, mineola: { lat: 32.6632, lng: -95.4882 },
  winnsboro: { lat: 32.9574, lng: -95.2903 }, rusk: { lat: 31.7963, lng: -95.1511 },
  "sulphur springs": { lat: 33.1385, lng: -95.6011 }, canton: { lat: 32.5565, lng: -95.8633 },
  athens: { lat: 32.2049, lng: -95.8550 }, palestine: { lat: 31.7621, lng: -95.6308 },
  center: { lat: 31.7946, lng: -94.1791 },
};

export const SCANNER_CONFIGS: Record<string, ScannerConfig> = {
  "piney-web": {
    slug: "piney-web",
    name: "Piney Web Co.",
    prospectsTable: "pineyweb_prospects",
    queueTable: "pineyweb_scanner_queue",
    keywords: [
      "restaurant", "cafe", "bar", "food truck",
      "auto shop", "mechanic", "tire shop", "body shop",
      "hair salon", "barbershop", "nail salon", "spa",
      "plumber", "electrician", "HVAC", "roofer", "painter", "landscaping",
      "dentist", "chiropractor", "optometrist", "veterinarian",
      "real estate", "insurance agent", "accountant", "lawyer",
      "gym", "martial arts", "dance studio", "daycare", "tutoring",
      "florist", "photography", "catering", "event venue",
      "feed store", "farm supply", "equipment dealer", "welding shop",
      "oilfield supply", "trucking company", "towing service",
    ],
    placeTypes: [
      "restaurant", "cafe", "bar", "beauty_salon", "hair_care", "spa",
      "car_repair", "plumber", "electrician", "locksmith", "painter", "roofing_contractor",
      "doctor", "dentist", "veterinary_care", "physiotherapist",
      "real_estate_agency", "lawyer", "accounting", "insurance_agency",
      "gym", "school", "florist", "photographer",
      "hardware_store", "general_contractor", "storage", "moving_company",
    ],
    chains: PINEY_WEB_CHAINS,
    disqualifyNames: [],
    requireWebsite: false,
    skipEmailEnrichment: false,
    storeWebsiteUrl: false,
    storePlaceTypes: false,
    centerCity: { name: "Longview", lat: 32.5007, lng: -94.7405 },
    radiusMeters: 40234,
    maxResultsPerRun: 500,
    coords: TX_COORDS,
  },
  "sip-society": {
    slug: "sip-society",
    name: "Sip Society Mobile Bar",
    prospectsTable: "sipsociety_prospects",
    queueTable: "sipsociety_scanner_queue",
    keywords: [
      "wedding planner", "wedding coordinator", "bridal consultant",
      "event coordinator", "event planner", "party planner",
      "wedding venue", "event venue", "reception venue",
      "banquet hall", "event space", "event center",
      "country club", "golf club event space",
      "winery event venue", "vineyard wedding",
      "barn wedding venue", "ranch wedding venue", "estate wedding venue",
      "bridal shop", "wedding florist", "wedding photographer",
      "wedding DJ", "catering company", "party rental company",
    ],
    placeTypes: ["lodging", "event_venue", "banquet_hall"],
    chains: SIP_SOCIETY_CHAINS,
    disqualifyNames: SIP_SOCIETY_DISQUALIFY,
    requireWebsite: true,
    skipEmailEnrichment: true,
    storeWebsiteUrl: true,
    storePlaceTypes: true,
    centerCity: { name: "Longview", lat: 32.5007, lng: -94.7405 },
    radiusMeters: 160934, // 100 miles
    maxResultsPerRun: 100,
    coords: TX_COORDS,
  },
};

export function getScannerConfig(slug: string): ScannerConfig {
  return SCANNER_CONFIGS[slug] || SCANNER_CONFIGS["piney-web"];
}
