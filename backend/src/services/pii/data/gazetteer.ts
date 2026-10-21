/**
 * Comprehensive maintainable gazetteer for Indian and global cities, states, and address markers.
 */

export const INDIAN_CITIES = new Set([
  'mumbai', 'delhi', 'new delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad',
  'pune', 'ahmedabad', 'surat', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore',
  'thane', 'bhopal', 'visakhapatnam', 'pimpri-chinchwad', 'patna', 'vadodara', 'ghaziabad',
  'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot', 'kalyan-dombivli',
  'vasai-virar', 'varanasi', 'srinagar', 'aurangabad', 'dhanbad', 'amritsar', 'navi mumbai',
  'allahabad', 'prayagraj', 'ranchi', 'howrah', 'coimbatore', 'jabalpur', 'gwalior',
  'vijayawada', 'jodhpur', 'madurai', 'raipur', 'kota', 'guwahati', 'chandigarh',
  'solapur', 'hubli', 'dharwad', 'bareilly', 'moradabad', 'mysore', 'mysuru', 'gurgaon',
  'gurugram', 'aligarh', 'jalandhar', 'tiruchirappalli', 'trichy', 'bhubaneswar', 'salem',
  'warangal', 'mira-bhayandar', 'thiruvananthapuram', 'bhiwandi', 'saharanpur', 'guntur',
  'amravati', 'bikaner', 'noida', 'jamshedpur', 'bhilai', 'cuttack', 'firozabad', 'kochi',
  'cochin', 'nellore', 'bhavnagar', 'dehradun', 'durgapur', 'asansol', 'rourkela', 'nanded',
  'kolhapur', 'ajmer', 'akola', 'gulbarga', 'kalaburagi', 'jamnagar', 'ujjain', 'loni',
  'siliguri', 'jhansi', 'ulhasnagar', 'jammu', 'sangli', 'miraj', 'mangalore', 'mangaluru',
  'erode', 'belgaum', 'belagavi', 'kurnool', 'ambattur', 'rajahmundry', 'tirunelveli',
  'malegaon', 'gaya', 'udaipur', 'kakinada', 'davanagere', 'kozhikode', 'calicut',
  'maheshtala', 'bokaro', 'south dumdum', 'bellary', 'ballari', 'patiala', 'gopalpur',
  'agartala', 'bhagalpur', 'muzaffarnagar', 'bhatpara', 'panihati', 'latur', 'dhule',
  'tirupati', 'rohtak', 'korba', 'bhilwara', 'berhampur', 'muzaffarpur', 'ahmednagar',
  'mathura', 'kollam', 'quilon', 'avadi', 'kadapa', 'kamarhati', 'sambalpur', 'bilaspur',
  'shahjahanpur', 'satara', 'bijapur', 'rampur', 'shivamogga', 'shimoga', 'chandrapur',
  'junagadh', 'thrissur', 'trichur', 'alwar', 'bardhaman', 'kulti', 'kancheepuram',
  'kanchipuram', 'vellore', 'panipat', 'haridwar', 'darbhanga', 'haldia', 'anantapur',
]);

export const GLOBAL_CITIES = new Set([
  'new york', 'san francisco', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
  'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville', 'fort worth',
  'columbus', 'charlotte', 'indianapolis', 'seattle', 'denver', 'washington', 'boston',
  'el paso', 'nashville', 'detroit', 'oklahoma city', 'portland', 'las vegas', 'memphis',
  'louisville', 'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno', 'sacramento',
  'mesa', 'kansas city', 'atlanta', 'omaha', 'colorado springs', 'raleigh', 'long beach',
  'virginia beach', 'miami', 'oakland', 'minneapolis', 'tulsa', 'tampa', 'arlington',
  'new orleans', 'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'toronto',
  'vancouver', 'montreal', 'ottawa', 'sydney', 'melbourne', 'brisbane', 'perth', 'tokyo',
  'osaka', 'kyoto', 'paris', 'berlin', 'munich', 'frankfurt', 'hamburg', 'amsterdam',
  'rotterdam', 'zurich', 'geneva', 'madrid', 'barcelona', 'rome', 'milan', 'vienna',
  'brussels', 'stockholm', 'oslo', 'copenhagen', 'dublin', 'singapore', 'hong kong',
  'dubai', 'abu dhabi', 'doha', 'riyadh', 'auckland',
]);

export const INDIAN_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa',
  'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura',
  'uttar pradesh', 'uttarakhand', 'west bengal', 'delhi', 'chandigarh', 'puducherry',
  'pondicherry', 'ladakh', 'jammu and kashmir',
]);

export const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming',
]);

export const US_STATE_CODES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv',
  'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn',
  'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'
]);

export function isKnownCity(cityName: string): boolean {
  const norm = cityName.trim().toLowerCase();
  return INDIAN_CITIES.has(norm) || GLOBAL_CITIES.has(norm);
}

export function isKnownState(stateName: string): boolean {
  const norm = stateName.trim().toLowerCase();
  return INDIAN_STATES.has(norm) || US_STATES.has(norm) || US_STATE_CODES.has(norm);
}
