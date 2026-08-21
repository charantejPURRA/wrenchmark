/* Vehicle catalogue. [model, class, firstYear, lastYear]
   class drives the rate card — derived automatically, never asked of the customer. */

const MAKES = {
  Acura: [['ILX','standard',2013,2022],['Integra','standard',2023,2026],['MDX','truck_suv',2010,2026],['RDX','truck_suv',2010,2026],['TLX','standard',2015,2026],['TSX','standard',2010,2014]],
  Audi: [['A3','euro_luxury',2010,2026],['A4','euro_luxury',2010,2026],['A5','euro_luxury',2010,2026],['A6','euro_luxury',2010,2026],['Q3','euro_luxury',2015,2026],['Q5','euro_luxury',2010,2026],['Q7','euro_luxury',2010,2026],['e-tron','euro_luxury',2019,2026]],
  BMW: [['2 Series','euro_luxury',2014,2026],['3 Series','euro_luxury',2010,2026],['4 Series','euro_luxury',2014,2026],['5 Series','euro_luxury',2010,2026],['X1','euro_luxury',2013,2026],['X3','euro_luxury',2010,2026],['X5','euro_luxury',2010,2026],['i4','euro_luxury',2022,2026]],
  Buick: [['Enclave','truck_suv',2010,2026],['Encore','truck_suv',2013,2026],['Envision','truck_suv',2016,2026],['LaCrosse','standard',2010,2019],['Regal','standard',2011,2020]],
  Cadillac: [['ATS','euro_luxury',2013,2019],['CT4','euro_luxury',2020,2026],['CT5','euro_luxury',2020,2026],['Escalade','truck_suv',2010,2026],['XT4','truck_suv',2019,2026],['XT5','truck_suv',2017,2026],['SRX','truck_suv',2010,2016]],
  Chevrolet: [['Blazer','truck_suv',2019,2026],['Bolt EV','economy',2017,2026],['Camaro','standard',2010,2024],['Colorado','truck_suv',2015,2026],['Cruze','economy',2011,2019],['Equinox','truck_suv',2010,2026],['Impala','standard',2010,2020],['Malibu','standard',2010,2026],['Silverado 1500','truck_suv',2010,2026],['Silverado 2500HD','truck_suv',2010,2026],['Suburban','truck_suv',2010,2026],['Tahoe','truck_suv',2010,2026],['Traverse','truck_suv',2010,2026],['Trax','economy',2015,2026]],
  Chrysler: [['300','standard',2011,2023],['Pacifica','truck_suv',2017,2026],['Town & Country','truck_suv',2010,2016]],
  Dodge: [['Challenger','standard',2010,2023],['Charger','standard',2010,2026],['Durango','truck_suv',2011,2026],['Grand Caravan','truck_suv',2010,2020],['Journey','truck_suv',2010,2020]],
  Ford: [['Bronco','truck_suv',2021,2026],['Bronco Sport','truck_suv',2021,2026],['Edge','truck_suv',2010,2024],['Escape','truck_suv',2010,2026],['Expedition','truck_suv',2010,2026],['Explorer','truck_suv',2010,2026],['F-150','truck_suv',2010,2026],['F-250','truck_suv',2010,2026],['Fiesta','economy',2011,2019],['Focus','economy',2010,2018],['Fusion','standard',2010,2020],['Maverick','truck_suv',2022,2026],['Mustang','standard',2010,2026],['Ranger','truck_suv',2019,2026],['Transit','truck_suv',2015,2026]],
  GMC: [['Acadia','truck_suv',2010,2026],['Canyon','truck_suv',2015,2026],['Sierra 1500','truck_suv',2010,2026],['Sierra 2500HD','truck_suv',2010,2026],['Terrain','truck_suv',2010,2026],['Yukon','truck_suv',2010,2026]],
  Honda: [['Accord','standard',2010,2026],['Civic','standard',2010,2026],['CR-V','truck_suv',2010,2026],['Fit','economy',2010,2020],['HR-V','truck_suv',2016,2026],['Insight','economy',2010,2022],['Odyssey','truck_suv',2010,2026],['Passport','truck_suv',2019,2026],['Pilot','truck_suv',2010,2026],['Ridgeline','truck_suv',2010,2026]],
  Hyundai: [['Accent','economy',2010,2022],['Elantra','economy',2010,2026],['Ioniq 5','standard',2022,2026],['Kona','economy',2018,2026],['Palisade','truck_suv',2020,2026],['Santa Fe','truck_suv',2010,2026],['Sonata','standard',2010,2026],['Tucson','truck_suv',2010,2026],['Venue','economy',2020,2026]],
  Infiniti: [['Q50','euro_luxury',2014,2026],['QX50','euro_luxury',2014,2026],['QX60','euro_luxury',2013,2026],['QX80','euro_luxury',2011,2026]],
  Jeep: [['Cherokee','truck_suv',2014,2023],['Compass','truck_suv',2010,2026],['Gladiator','truck_suv',2020,2026],['Grand Cherokee','truck_suv',2010,2026],['Renegade','truck_suv',2015,2023],['Wrangler','truck_suv',2010,2026]],
  Kia: [['Forte','economy',2010,2026],['K5','standard',2021,2026],['Optima','standard',2010,2020],['Rio','economy',2010,2023],['Seltos','economy',2021,2026],['Sorento','truck_suv',2010,2026],['Soul','economy',2010,2026],['Sportage','truck_suv',2010,2026],['Telluride','truck_suv',2020,2026]],
  Lexus: [['ES','euro_luxury',2010,2026],['GX','euro_luxury',2010,2026],['IS','euro_luxury',2010,2026],['NX','euro_luxury',2015,2026],['RX','euro_luxury',2010,2026]],
  Lincoln: [['Aviator','euro_luxury',2020,2026],['Corsair','euro_luxury',2020,2026],['MKZ','euro_luxury',2010,2020],['Nautilus','euro_luxury',2019,2026],['Navigator','truck_suv',2010,2026]],
  Mazda: [['CX-30','standard',2020,2026],['CX-5','truck_suv',2013,2026],['CX-9','truck_suv',2010,2023],['CX-90','truck_suv',2024,2026],['Mazda3','economy',2010,2026],['Mazda6','standard',2010,2021],['MX-5 Miata','standard',2010,2026]],
  'Mercedes-Benz': [['A-Class','euro_luxury',2019,2022],['C-Class','euro_luxury',2010,2026],['E-Class','euro_luxury',2010,2026],['GLA','euro_luxury',2015,2026],['GLC','euro_luxury',2016,2026],['GLE','euro_luxury',2010,2026],['Sprinter','truck_suv',2010,2026]],
  Mitsubishi: [['Eclipse Cross','standard',2018,2026],['Outlander','truck_suv',2010,2026],['Outlander Sport','standard',2011,2026]],
  Nissan: [['Altima','standard',2010,2026],['Armada','truck_suv',2010,2026],['Frontier','truck_suv',2010,2026],['Kicks','economy',2018,2026],['Leaf','economy',2011,2026],['Maxima','standard',2010,2023],['Murano','truck_suv',2010,2026],['Pathfinder','truck_suv',2010,2026],['Rogue','truck_suv',2010,2026],['Sentra','economy',2010,2026],['Titan','truck_suv',2010,2024],['Versa','economy',2010,2026]],
  Ram: [['1500','truck_suv',2010,2026],['2500','truck_suv',2010,2026],['ProMaster','truck_suv',2014,2026]],
  Subaru: [['Ascent','truck_suv',2019,2026],['Crosstrek','standard',2013,2026],['Forester','truck_suv',2010,2026],['Impreza','economy',2010,2026],['Legacy','standard',2010,2026],['Outback','truck_suv',2010,2026],['WRX','standard',2010,2026]],
  Tesla: [['Model 3','euro_luxury',2018,2026],['Model S','euro_luxury',2013,2026],['Model X','euro_luxury',2016,2026],['Model Y','euro_luxury',2020,2026]],
  Toyota: [['4Runner','truck_suv',2010,2026],['Avalon','standard',2010,2022],['Camry','standard',2010,2026],['Corolla','economy',2010,2026],['Highlander','truck_suv',2010,2026],['Prius','economy',2010,2026],['RAV4','truck_suv',2010,2026],['Sequoia','truck_suv',2010,2026],['Sienna','truck_suv',2010,2026],['Tacoma','truck_suv',2010,2026],['Tundra','truck_suv',2010,2026],['Venza','truck_suv',2021,2026]],
  Volkswagen: [['Atlas','truck_suv',2018,2026],['Golf','euro_luxury',2010,2026],['ID.4','euro_luxury',2021,2026],['Jetta','euro_luxury',2010,2026],['Passat','euro_luxury',2010,2022],['Taos','euro_luxury',2022,2026],['Tiguan','euro_luxury',2010,2026]],
  Volvo: [['S60','euro_luxury',2010,2026],['V60','euro_luxury',2015,2026],['XC40','euro_luxury',2019,2026],['XC60','euro_luxury',2010,2026],['XC90','euro_luxury',2010,2026]],
};

const NOW = 2026;
const YEARS = [];
for (let y = NOW; y >= 2010; y--) YEARS.push(y);

function makesForYear(year) {
  const y = Number(year);
  return Object.keys(MAKES).filter((mk) => MAKES[mk].some(([, , a, b]) => y >= a && y <= b)).sort();
}

function modelsFor(year, make) {
  const y = Number(year);
  return (MAKES[make] || []).filter(([, , a, b]) => y >= a && y <= b)
    .map(([name, cls]) => ({ name, cls })).sort((p, q) => p.name.localeCompare(q.name));
}

function classFor(make, model) {
  const row = (MAKES[make] || []).find(([n]) => n === model);
  return row ? row[1] : 'standard';
}

const CLASS_LABEL = {
  economy: 'Compact',
  standard: 'Sedan / midsize',
  truck_suv: 'Truck / SUV',
  euro_luxury: 'European / luxury',
};

module.exports = { MAKES, YEARS, makesForYear, modelsFor, classFor, CLASS_LABEL };
