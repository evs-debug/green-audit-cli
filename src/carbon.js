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
