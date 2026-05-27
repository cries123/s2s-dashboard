import { Customer } from "../types";

export function getAverageServiceIntervalDays(customer: Customer): number {
  const visits = customer.recentVisits || [];
  if (visits.length < 2) {
    return 180; // Default to 6 months (180 days)
  }
  
  // Sort visits chronologically
  const sorted = [...visits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let totalDays = 0;
  let calculationCount = 0;
  
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].date).getTime();
    const currTime = new Date(sorted[i].date).getTime();
    if (!isNaN(prevTime) && !isNaN(currTime)) {
      const diff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
      if (diff > 0) {
        totalDays += diff;
        calculationCount++;
      }
    }
  }
  
  return calculationCount > 0 ? (totalDays / calculationCount) : 180;
}

export function getAverageServiceIntervalMonths(customer: Customer): number {
  const days = getAverageServiceIntervalDays(customer);
  return Number((days / 30.4375).toFixed(1));
}

export function getLastServiceDate(customer: Customer): Date | null {
  const visits = customer.recentVisits || [];
  if (visits.length === 0) {
    if (customer.soldDate) {
      const sd = new Date(customer.soldDate + 'T00:00:00');
      return isNaN(sd.getTime()) ? null : sd;
    }
    return null;
  }
  
  // Sort descending to find the latest
  const sorted = [...visits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const d = new Date(sorted[0].date + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function calculateServiceCycle(soldDateStr: string): number {
  if (!soldDateStr) return 0;
  try {
    const soldDate = new Date(soldDateStr + 'T00:00:00');
    if (isNaN(soldDate.getTime())) return 0;
    
    const now = new Date();
    // Use UTC for consistent date difference calculation
    const diffTime = now.getTime() - soldDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // We want to trigger an alert as soon as they HIT day 180, 360, etc.
    // If diffDays is 180, cycle is 1. If 179, cycle is 0.
    return Math.floor(diffDays / 180);
  } catch (e) {
    return 0;
  }
}

export function getNextServiceMilestone(customerOrSoldDate: Customer | string): string {
  if (!customerOrSoldDate) return 'N/A';
  
  if (typeof customerOrSoldDate === 'string') {
    // Legacy/fallback support
    try {
      const soldDate = new Date(customerOrSoldDate + 'T00:00:00');
      if (isNaN(soldDate.getTime())) return 'N/A';
      
      const currentCycle = calculateServiceCycle(customerOrSoldDate);
      const nextMilestoneDate = new Date(soldDate.getTime());
      nextMilestoneDate.setDate(nextMilestoneDate.getDate() + (currentCycle + 1) * 180);
      
      return nextMilestoneDate.toLocaleDateString();
    } catch (e) {
      return 'N/A';
    }
  }
  
  const customer = customerOrSoldDate;
  const avgDays = getAverageServiceIntervalDays(customer);
  const lastDate = getLastServiceDate(customer);
  if (!lastDate) return 'N/A';
  
  const nextDue = new Date(lastDate.getTime() + avgDays * 24 * 60 * 60 * 1000);
  return nextDue.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function isServiceAlertActive(customer: Customer): boolean {
  if (!customer.enableServiceAlert) return false;
  
  // If the customer has a stop alert set, don't show it
  if (customer.stopAlertInfo) return false;

  const avgDays = getAverageServiceIntervalDays(customer);
  const lastDate = getLastServiceDate(customer);
  if (!lastDate) return false;

  const nextDue = new Date(lastDate.getTime() + avgDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  // If a manual contact has been logged after the last service due date
  if (customer.lastServiceContact) {
    const lastContactTime = new Date(customer.lastServiceContact.seconds * 1000).getTime();
    if (lastContactTime > lastDate.getTime() && lastContactTime > nextDue.getTime()) {
      return false;
    }
  }

  return now.getTime() >= nextDue.getTime();
}
