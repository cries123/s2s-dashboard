import { Customer } from "../types";

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

export function getNextServiceMilestone(soldDateStr: string): string {
  if (!soldDateStr) return 'N/A';
  try {
    const soldDate = new Date(soldDateStr + 'T00:00:00');
    if (isNaN(soldDate.getTime())) return 'N/A';
    
    const currentCycle = calculateServiceCycle(soldDateStr);
    const nextMilestoneDate = new Date(soldDate.getTime());
    nextMilestoneDate.setDate(nextMilestoneDate.getDate() + (currentCycle + 1) * 180);
    
    return nextMilestoneDate.toLocaleDateString();
  } catch (e) {
    return 'N/A';
  }
}

export function isServiceAlertActive(customer: Customer): boolean {
  if (!customer.enableServiceAlert || !customer.soldDate) return false;
  
  // If the customer has a stop alert set, don't show it
  if (customer.stopAlertInfo) return false;

  const currentCycle = calculateServiceCycle(customer.soldDate);
  const acknowledgedCycle = customer.lastAcknowledgedCycle ?? -1;
  
  // Alert is active if the current 180-day cycle is higher than what we last acknowledged
  // For a brand new customer (cycle 0), alert triggers when cycle reaches 1 (180 days).
  return currentCycle > acknowledgedCycle && currentCycle > 0;
}
