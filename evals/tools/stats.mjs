function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMean(values, { iterations = 4000, seed = 20261124 } = {}) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, low: null, high: null, n: values.length };
  const random = seededRandom(seed);
  const means = new Float64Array(iterations);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let index = 0; index < values.length; index++) sum += values[Math.floor(random() * values.length)];
    means[iteration] = sum / values.length;
  }
  means.sort();
  return { mean, low: means[Math.floor(iterations * 0.025)], high: means[Math.floor(iterations * 0.975)], n: values.length };
}

export function wilson(successes, total, z = 1.96) {
  if (total === 0) return { mean: null, low: null, high: null, n: 0 };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { mean: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin), n: total };
}

export function formatInterval({ mean, low, high, n }, percent = false) {
  if (mean === null || mean === undefined) return 'n/a';
  const format = (value) => (percent ? `${(100 * value).toFixed(0)}%` : Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));
  return low === null ? `${format(mean)} (n=${n})` : `${format(mean)} [${format(low)}, ${format(high)}] (n=${n})`;
}

export function pairedDifference(results, baselineArm, arm, measure, { requireCorrect = false } = {}) {
  const differences = [];
  for (const name of new Set(results.map((entry) => entry.case))) {
    const pick = (label) =>
      results
        .filter((entry) => entry.case === name && entry.arm === label && (!requireCorrect || entry.correct))
        .map(measure)
        .filter((value) => typeof value === 'number' && !Number.isNaN(value));
    const baseline = pick(baselineArm);
    const treatment = pick(arm);
    if (baseline.length === 0 || treatment.length === 0) continue;
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    differences.push(mean(treatment) - mean(baseline));
  }
  if (differences.length === 0) return null;
  return { interval: bootstrapMean(differences), cases: differences.length };
}

export function shuffleWithSeed(items, seed) {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
