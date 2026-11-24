import { daysBetween } from './dates.ts';

export interface Plan {
  name: string;
  monthlyPriceCents: number;
}

export interface PlanChange {
  from: Plan;
  to: Plan;
  cycleStart: string;
  cycleEnd: string;
  changeDate: string;
}

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface Proration {
  lines: InvoiceLine[];
  totalCents: number;
}

export function prorateMidCycleChange(change: PlanChange): Proration {
  const { from, to, cycleStart, cycleEnd, changeDate } = change;
  const cycleDays = daysBetween(cycleStart, cycleEnd);
  const remainingDays = daysBetween(changeDate, cycleEnd);

  if (daysBetween(cycleStart, changeDate) < 0 || remainingDays <= 0) {
    throw new RangeError(`Change date ${changeDate} is outside the cycle ${cycleStart} to ${cycleEnd}`);
  }

  const unusedCents = proratedCents(from.monthlyPriceCents, remainingDays, cycleDays);
  const newCents = proratedCents(to.monthlyPriceCents, remainingDays, cycleDays);

  const lines = [
    { description: `Credit: unused ${from.name}`, amountCents: asCredit(unusedCents) },
    { description: `Charge: remaining ${to.name}`, amountCents: newCents },
  ];
  return { lines, totalCents: newCents - unusedCents };
}

function proratedCents(priceCents: number, days: number, cycleDays: number): number {
  const numerator = priceCents * days;
  return Math.floor((2 * numerator + cycleDays) / (2 * cycleDays));
}

function asCredit(cents: number): number {
  return cents === 0 ? 0 : -cents;
}
