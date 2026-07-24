// Constants based on the Sustainable Web Design model averages
const ENERGY_PER_GB_KWH = 0.81; // kWh per GB transferred (network + datacenter + device)
const GRID_CARBON_INTENSITY_G_PER_KWH = 442; // global average grams CO2e per kWh

function estimateCarbon(totalBytes) {
  const gb = totalBytes / (1024 ** 3);
  const energyKwh = gb * ENERGY_PER_GB_KWH;
  const carbonGrams = energyKwh * GRID_CARBON_INTENSITY_G_PER_KWH;
  return { energyKwh, carbonGrams };
}

module.exports = { estimateCarbon };

function getGrade(carbonGrams) {
  if (carbonGrams < 0.5) return { grade: 'A', label: 'Excellent — well below average' };
  if (carbonGrams < 1.5) return { grade: 'B', label: 'Good — near typical average' };
  if (carbonGrams < 3.5) return { grade: 'C', label: 'Fair — above average footprint' };
  if (carbonGrams < 6.5) return { grade: 'D', label: 'Poor — high footprint' };
  return { grade: 'F', label: 'Very poor — significant optimization needed' };
}

module.exports.getGrade = getGrade;
