// Exact port of sizing_engine.py — no logic changes

const CELL_VOLTAGES: Record<string, { nominal: number; max: number; end: number }> = {
  LFP: { nominal: 3.2, max: 3.6, end: 2.8 },
  NPM: { nominal: 3.6, max: 4.2, end: 3.0 },
};

const DC_TO_CELLS: Record<number, number> = {
  12: 4, 24: 8, 36: 11, 48: 15, 72: 23, 96: 30,
  120: 38, 144: 45, 192: 60, 240: 75,
  336: 105, 360: 112, 384: 120,
  408: 128, 480: 150, 512: 160,
  528: 165, 576: 180,
};

export const SizingEngine = {
  calculateLoad(actualKw: number, actualKva: number, upsKva: number, pf: number, eff: number): number {
    if (actualKw > 0) return actualKw / eff;
    if (actualKva > 0) return (actualKva * pf) / eff;
    if (upsKva > 0) return (upsKva * pf) / eff;
    return 0;
  },

  numberOfCells(nominalDcVoltage: number): number {
    return DC_TO_CELLS[nominalDcVoltage] ?? 0;
  },

  voltageValues(cells: number, chemistry: string): { maxChargeVoltage: number; endCellVoltage: number } {
    const cell = CELL_VOLTAGES[chemistry] ?? CELL_VOLTAGES.LFP;
    return {
      maxChargeVoltage: Math.round(cells * cell.max * 10) / 10,
      endCellVoltage: Math.round(cells * cell.end * 10) / 10,
    };
  },

  energyRequired(loadKw: number, backupMin: number): number {
    return Math.round(((loadKw * backupMin) / 60) * 10) / 10;
  },

  capacityRequired(energyKwh: number, endCellVoltage: number): number {
    if (!endCellVoltage) return 0;
    return Math.round(((energyKwh * 1000) / endCellVoltage) * 10) / 10;
  },

  capacityWithAgeing(base: number, ageingPct: number): number {
    return Math.round((base + base * (ageingPct / 100)) * 10) / 10;
  },

  capacityWithDesignMargin(cap: number, dmPct: number): number {
    return Math.round((cap + cap * (dmPct / 100)) * 10) / 10;
  },

  capacityWithDod(cap: number, dodPct: number): number {
    const f = dodPct > 0 ? dodPct / 100 : 1;
    return Math.round((cap / f) * 10) / 10;
  },

  capacityWithDerating(cap: number, derPct: number): number {
    return Math.round((cap + cap * (derPct / 100)) * 10) / 10;
  },

  backupTime(backupReq: number, requiredCap: number, nearestCap: number): number {
    return Math.floor((backupReq / requiredCap) * nearestCap);
  },

  totalAvailableEnergy(nominalDcVoltage: number, capacity: number): number {
    return (nominalDcVoltage * capacity) / 1000;
  },

  offeredBatteryConfig(nominalDcVoltage: number, capacity: number): string {
    return `${Math.round(nominalDcVoltage)}V ${Math.round(capacity)}Ah`;
  },
};

export interface SizingOutputs {
  calculatedLoadKw: number;
  numberOfCells: number;
  maxChargingVoltage: number;
  endCellVoltage: number;
  energyRequiredKwh: number;
  capacityRequiredAh: number;
  capWithAgeingAh: number;
  capWithDesignMarginAh: number;
  capWithDodAh: number;
  capWithDeratingAh: number;
  backupTimeMin: number;
  totalAvailableEnergyKwh: number;
  offeredBatteryConfig: string;
}

export function runCalculation(
  inputs: {
    actualKw: number; actualKva: number; upsKva: number;
    powerFactor: number; inverterEfficiency: number;
    nominalDcVoltage: number; backupRequirementMin: number;
    ageingPct: number; designMarginPct: number; dodMarginPct: number;
    deratingPct: number; cellChemistry: string; nearestCapacity: number;
  }
): SizingOutputs {
  const { actualKw, actualKva, upsKva, powerFactor, inverterEfficiency,
    nominalDcVoltage, backupRequirementMin, ageingPct, designMarginPct,
    dodMarginPct, deratingPct, cellChemistry, nearestCapacity } = inputs;

  const load = SizingEngine.calculateLoad(actualKw, actualKva, upsKva, powerFactor, inverterEfficiency);
  const cells = SizingEngine.numberOfCells(nominalDcVoltage);
  const { maxChargeVoltage, endCellVoltage } = SizingEngine.voltageValues(cells, cellChemistry);
  const energy = SizingEngine.energyRequired(load, backupRequirementMin);
  const capBase = SizingEngine.capacityRequired(energy, endCellVoltage);
  const capAge = SizingEngine.capacityWithAgeing(capBase, ageingPct);
  const capDm = SizingEngine.capacityWithDesignMargin(capAge, designMarginPct);
  const capDod = SizingEngine.capacityWithDod(capDm, dodMarginPct);
  const capDer = SizingEngine.capacityWithDerating(capDod, deratingPct);

  let backupTime = 0, totalEnergy = 0, config = "";
  if (nearestCapacity > 0 && capDer > 0) {
    backupTime = SizingEngine.backupTime(backupRequirementMin, capDer, nearestCapacity);
    totalEnergy = SizingEngine.totalAvailableEnergy(nominalDcVoltage, nearestCapacity);
    config = SizingEngine.offeredBatteryConfig(nominalDcVoltage, nearestCapacity);
  }

  return {
    calculatedLoadKw: Math.round(load * 100) / 100,
    numberOfCells: cells,
    maxChargingVoltage: maxChargeVoltage,
    endCellVoltage: endCellVoltage,
    energyRequiredKwh: energy,
    capacityRequiredAh: capBase,
    capWithAgeingAh: capAge,
    capWithDesignMarginAh: capDm,
    capWithDodAh: capDod,
    capWithDeratingAh: capDer,
    backupTimeMin: backupTime,
    totalAvailableEnergyKwh: totalEnergy,
    offeredBatteryConfig: config,
  };
}
