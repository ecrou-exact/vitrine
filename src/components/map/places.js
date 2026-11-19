// @ts-check
/**
 * Cities the map finds without any service: capitals and large cities, with the names
 * they are written with in English and French. Anything else needs coordinates, or a
 * geocoder the page chooses (see the `geocoder` attribute).
 *
 * @module components/map/places
 */
import { normalize } from './countries.js';

/** `names|alpha2|lat|lon`, names separated by commas, first one shown. */
const CITIES = `Paris|FR|48.8566|2.3522
Lyon|FR|45.764|4.8357
Marseille|FR|43.2965|5.3698
Toulouse|FR|43.6047|1.4442
Bordeaux|FR|44.8378|-0.5792
Lille|FR|50.6292|3.0573
Nice|FR|43.7102|7.262
Strasbourg|FR|48.5734|7.7521
Nantes|FR|47.2184|-1.5536
London,Londres|GB|51.5072|-0.1276
Manchester|GB|53.4808|-2.2426
Edinburgh,Édimbourg|GB|55.9533|-3.1883
Dublin|IE|53.3498|-6.2603
Brussels,Bruxelles|BE|50.8503|4.3517
Luxembourg|LU|49.6116|6.1319
Amsterdam|NL|52.3676|4.9041
Rotterdam|NL|51.9244|4.4777
The Hague,La Haye|NL|52.0705|4.3007
Berlin|DE|52.52|13.405
Munich,München|DE|48.1351|11.582
Frankfurt,Francfort|DE|50.1109|8.6821
Hamburg,Hambourg|DE|53.5511|9.9937
Cologne,Köln|DE|50.9375|6.9603
Zurich,Zürich|CH|47.3769|8.5417
Geneva,Genève|CH|46.2044|6.1432
Bern,Berne|CH|46.948|7.4474
Vienna,Vienne,Wien|AT|48.2082|16.3738
Prague,Praha|CZ|50.0755|14.4378
Warsaw,Varsovie,Warszawa|PL|52.2297|21.0122
Budapest|HU|47.4979|19.0402
Bratislava|SK|48.1486|17.1077
Ljubljana|SI|46.0569|14.5058
Zagreb|HR|45.815|15.9819
Belgrade,Beograd|RS|44.7866|20.4489
Bucharest,Bucarest|RO|44.4268|26.1025
Sofia|BG|42.6977|23.3219
Athens,Athènes|GR|37.9838|23.7275
Rome,Roma|IT|41.9028|12.4964
Milan,Milano|IT|45.4642|9.19
Naples,Napoli|IT|40.8518|14.2681
Venice,Venise,Venezia|IT|45.4408|12.3155
Madrid|ES|40.4168|-3.7038
Barcelona,Barcelone|ES|41.3874|2.1686
Seville,Séville,Sevilla|ES|37.3891|-5.9845
Valencia,Valence|ES|39.4699|-0.3763
Lisbon,Lisbonne,Lisboa|PT|38.7223|-9.1393
Porto|PT|41.1579|-8.6291
Copenhagen,Copenhague|DK|55.6761|12.5683
Oslo|NO|59.9139|10.7522
Stockholm|SE|59.3293|18.0686
Helsinki|FI|60.1699|24.9384
Reykjavik,Reykjavík|IS|64.1466|-21.9426
Tallinn|EE|59.437|24.7536
Riga|LV|56.9496|24.1052
Vilnius|LT|54.6872|25.2797
Kyiv,Kiev|UA|50.4501|30.5234
Minsk|BY|53.9006|27.559
Moscow,Moscou|RU|55.7558|37.6173
Saint Petersburg,Saint-Pétersbourg|RU|59.9311|30.3609
Istanbul|TR|41.0082|28.9784
Ankara|TR|39.9334|32.8597
Tbilisi|GE|41.7151|44.8271
Yerevan,Erevan|AM|40.1792|44.4991
Baku,Bakou|AZ|40.4093|49.8671
Tehran,Téhéran|IR|35.6892|51.389
Baghdad,Bagdad|IQ|33.3152|44.3661
Riyadh,Riyad|SA|24.7136|46.6753
Jeddah,Djeddah|SA|21.4858|39.1925
Dubai,Dubaï|AE|25.2048|55.2708
Abu Dhabi|AE|24.4539|54.3773
Doha|QA|25.2854|51.531
Jerusalem,Jérusalem|IL|31.7683|35.2137
Tel Aviv|IL|32.0853|34.7818
Beirut,Beyrouth|LB|33.8938|35.5018
Amman|JO|31.9454|35.9284
Cairo,Le Caire|EG|30.0444|31.2357
Casablanca|MA|33.5731|-7.5898
Rabat|MA|34.0209|-6.8416
Algiers,Alger|DZ|36.7538|3.0588
Tunis|TN|36.8065|10.1815
Dakar|SN|14.7167|-17.4677
Abidjan|CI|5.36|-4.0083
Lagos|NG|6.5244|3.3792
Abuja|NG|9.0765|7.3986
Accra|GH|5.6037|-0.187
Kinshasa|CD|-4.4419|15.2663
Nairobi|KE|-1.2921|36.8219
Addis Ababa,Addis-Abeba|ET|8.9806|38.7578
Kampala|UG|0.3476|32.5825
Dar es Salaam|TZ|-6.7924|39.2083
Luanda|AO|-8.839|13.2894
Johannesburg|ZA|-26.2041|28.0473
Cape Town,Le Cap|ZA|-33.9249|18.4241
Antananarivo|MG|-18.8792|47.5079
Karachi|PK|24.8607|67.0011
Islamabad|PK|33.6844|73.0479
Kabul|AF|34.5553|69.2075
New Delhi,Delhi|IN|28.6139|77.209
Mumbai,Bombay|IN|19.076|72.8777
Bangalore,Bengaluru|IN|12.9716|77.5946
Kolkata,Calcutta|IN|22.5726|88.3639
Chennai|IN|13.0827|80.2707
Dhaka|BD|23.8103|90.4125
Kathmandu,Katmandou|NP|27.7172|85.324
Colombo|LK|6.9271|79.8612
Bangkok|TH|13.7563|100.5018
Hanoi|VN|21.0278|105.8342
Ho Chi Minh City,Hô Chi Minh-Ville,Saigon|VN|10.8231|106.6297
Kuala Lumpur|MY|3.139|101.6869
Singapore,Singapour|SG|1.3521|103.8198
Jakarta|ID|-6.2088|106.8456
Manila,Manille|PH|14.5995|120.9842
Beijing,Pékin|CN|39.9042|116.4074
Shanghai|CN|31.2304|121.4737
Hong Kong|HK|22.3193|114.1694
Shenzhen|CN|22.5431|114.0579
Taipei|TW|25.033|121.5654
Seoul,Séoul|KR|37.5665|126.978
Pyongyang|KP|39.0392|125.7625
Tokyo|JP|35.6762|139.6503
Osaka|JP|34.6937|135.5023
Ulaanbaatar,Oulan-Bator|MN|47.8864|106.9057
Astana|KZ|51.1694|71.4491
Tashkent,Tachkent|UZ|41.2995|69.2401
Sydney|AU|-33.8688|151.2093
Melbourne|AU|-37.8136|144.9631
Brisbane|AU|-27.4698|153.0251
Perth|AU|-31.9505|115.8605
Canberra|AU|-35.2809|149.13
Auckland|NZ|-36.8485|174.7633
Wellington|NZ|-41.2865|174.7762
Honolulu|US|21.3069|-157.8583
Anchorage|US|61.2181|-149.9003
Washington,Washington DC|US|38.9072|-77.0369
New York,New York City,NYC|US|40.7128|-74.006
Boston|US|42.3601|-71.0589
Chicago|US|41.8781|-87.6298
Miami|US|25.7617|-80.1918
Atlanta|US|33.749|-84.388
Houston|US|29.7604|-95.3698
Dallas|US|32.7767|-96.797
Denver|US|39.7392|-104.9903
Seattle|US|47.6062|-122.3321
San Francisco|US|37.7749|-122.4194
Los Angeles|US|34.0522|-118.2437
Las Vegas|US|36.1699|-115.1398
Toronto|CA|43.6532|-79.3832
Montreal,Montréal|CA|45.5019|-73.5674
Quebec City,Québec|CA|46.8139|-71.208
Vancouver|CA|49.2827|-123.1207
Ottawa|CA|45.4215|-75.6972
Mexico City,Mexico,Ciudad de México|MX|19.4326|-99.1332
Havana,La Havane|CU|23.1136|-82.3666
Panama City,Panama|PA|8.9824|-79.5199
Bogotá,Bogota|CO|4.711|-74.0721
Caracas|VE|10.4806|-66.9036
Lima|PE|-12.0464|-77.0428
Quito|EC|-0.1807|-78.4678
Santiago|CL|-33.4489|-70.6693
Buenos Aires|AR|-34.6037|-58.3816
Montevideo|UY|-34.9011|-56.1645
São Paulo,Sao Paulo|BR|-23.5505|-46.6333
Rio de Janeiro|BR|-22.9068|-43.1729
Brasília,Brasilia|BR|-15.7975|-47.8919
La Paz|BO|-16.4897|-68.1193
Nuuk|GL|64.1814|-51.6941
North Pole,Pôle Nord|AQ|90|0
South Pole,Pôle Sud|AQ|-90|0`;

/** @typedef {{ name: string, country: string, lat: number, lon: number }} City */

/** @type {Map<string, City> | null} */
let index = null;

/**
 * The built-in city of that name (in English or French, accents optional), or null.
 *
 * @param {string} text
 * @returns {City | null}
 */
export function findCity(text) {
  if (!index) {
    index = new Map();
    for (const line of CITIES.split('\n')) {
      const [names, country, lat, lon] = line.split('|');
      const list = names.split(',');
      const city = { name: list[0], country, lat: Number(lat), lon: Number(lon) };
      for (const name of list) index.set(normalize(name), city);
    }
  }
  const key = normalize(text);
  return index.get(key) ?? index.get(key.replace(/,.*$/, '').trim()) ?? null;
}

/** @returns {number} How many cities are built in. */
export function cityCount() {
  return CITIES.split('\n').length;
}
