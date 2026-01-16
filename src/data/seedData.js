export const legacyResins = [
  { id: "pyroblast", name: "PYROBLAST+", active: true, profiles: 50 },
  { id: "iron", name: "IRON", active: true, profiles: 60 },
  { id: "spin", name: "SPIN+", active: true, profiles: 55 },
  { id: "poseidon", name: "POSEIDON", active: true, profiles: 40 },
  { id: "alchemist", name: "ALCHEMIST", active: true, profiles: 30 }
];

export const legacyProfiles = [
  // IRON - Saturn 3 Ultra (CORRECTED ID: double underscore)
  {
    id: "iron__elegoo__saturn_3_ultra",
    resinId: "iron",
    resinName: "IRON",
    printerId: "elegoo__saturn_3_ultra",
    brand: "ELEGOO",
    model: "SATURN 3 ULTRA",
    params: { layerHeightMm: 0.05, baseLayers: 6, exposureTimeS: 1.3, baseExposureTimeS: 22, uvOffDelayS: 0, liftDistanceMm: 0, liftSpeedMmS: 0, retractSpeedMmS: 0, restBeforeLiftS: 0.5 }
  },
  // SPIN - Saturn 3 Ultra
  {
    id: "spin__elegoo__saturn_3_ultra",
    resinId: "spin",
    resinName: "SPIN+",
    printerId: "elegoo__saturn_3_ultra",
    brand: "ELEGOO",
    model: "SATURN 3 ULTRA",
    params: { layerHeightMm: 0.05, baseLayers: 6, exposureTimeS: 1.3, baseExposureTimeS: 22, uvOffDelayS: 0, liftDistanceMm: 0, liftSpeedMmS: 0, retractSpeedMmS: 0, restBeforeLiftS: 0.5 }
  },
  // PYROBLAST - Saturn 3 Ultra
  {
    id: "pyroblast__elegoo__saturn_3_ultra",
    resinId: "pyroblast",
    resinName: "PYROBLAST+",
    printerId: "elegoo__saturn_3_ultra",
    brand: "ELEGOO",
    model: "SATURN 3 ULTRA",
    params: { layerHeightMm: 0.05, baseLayers: 6, exposureTimeS: 1.3, baseExposureTimeS: 22, uvOffDelayS: 0, liftDistanceMm: 0, liftSpeedMmS: 0, retractSpeedMmS: 0, restBeforeLiftS: 0.5 }
  },
  // IRON - Mars 4 Ultra
  {
    id: "iron__elegoo__mars_4_ultra",
    resinId: "iron",
    resinName: "IRON",
    printerId: "elegoo__mars_4_ultra",
    brand: "ELEGOO",
    model: "MARS 4 ULTRA",
    params: { layerHeightMm: 0.05, baseLayers: 5, exposureTimeS: 1.5, baseExposureTimeS: 35, uvOffDelayS: 0, liftDistanceMm: 0, liftSpeedMmS: 0, retractSpeedMmS: 0, restBeforeLiftS: 1 }
  },
  // IRON - Anycubic Mono M5s
  {
    id: "iron__anycubic__photon_mono_m5s",
    resinId: "iron",
    resinName: "IRON",
    printerId: "anycubic__photon_mono_m5s",
    brand: "ANYCUBIC",
    model: "PHOTON MONO M5S",
    params: { layerHeightMm: 0.05, baseLayers: 6, exposureTimeS: 1.5, baseExposureTimeS: 20, uvOffDelayS: 0, liftDistanceMm: 0, liftSpeedMmS: 0, retractSpeedMmS: 0, restBeforeLiftS: 0.5 }
  }
];
