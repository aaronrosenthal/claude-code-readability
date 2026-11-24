// Pricing module
// Tiered unit pricing for usage based billing
// (see billing wiki "Usage tiers" for the rate card)

interface Tier {
  upTo: number; // last unit in this tier
  unitCents: number;
}

// tiers, cheapest last
const TIERS: Tier[] = [
  { upTo: 100, unitCents: 50 },
  { upTo: 1000, unitCents: 30 },
  { upTo: Infinity, unitCents: 20 },
];

// calculate the price in cents for a number of units
export function priceForUnits(units: number): number {
  // start with zero
  let total = 0;
  // lower bound of the current tier
  let lower = 0;

  // go through every tier
  for (const tier of TIERS) {
    // if we have no units left in this tier stop
    if (units <= lower) break;

    // how many units fall in this tier
    const inTier = Math.min(units, tier.upTo) - lower;
    // add the cost
    total += inTier * tier.unitCents;

    // move the lower bound up
    lower = tier.upTo;
  }

  // const VOLUME_DISCOUNT = 0.05;
  // if (units > 5000) {
  //   total = Math.round(total * (1 - VOLUME_DISCOUNT));
  // }

  // return the total
  return total;
}

// average price per unit in cents
export function averageUnitCents(units: number): number {
  if (units === 0) return 0;
  return priceForUnits(units) / units;
}

// format cents as a dollar string
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
