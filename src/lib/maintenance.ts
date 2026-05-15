
export interface MaintenanceTask {
  task: string;
  importance: 'high' | 'medium' | 'low';
  interval: string;
}

export function getRecommendedServices(monthsOfOwnership: number): MaintenanceTask[] {
  // We'll use 6-month increments (standard for most dealers)
  const cycle6mo = Math.floor(monthsOfOwnership / 6);
  
  if (cycle6mo < 1) {
    return [
      { task: 'First 1,000 Mile "Break-In" Check', importance: 'low', interval: '1mo' },
      { task: 'Tire Pressure Adjustment', importance: 'low', interval: 'Monthly' }
    ];
  }

  const tasks: MaintenanceTask[] = [
    { task: 'Synthetic Oil & Filter Change', importance: 'high', interval: '6mo / 7,500mi' },
    { task: 'Tire Rotation & Balance', importance: 'high', interval: '6mo / 7,500mi' },
    { task: 'Multi-Point Safety Inspection', importance: 'medium', interval: 'Every Visit' }
  ];

  // Yearly or approx 15k miles
  if (cycle6mo % 2 === 0) {
    tasks.push({ task: 'Cabin Air Filter Replacement', importance: 'medium', interval: '12mo / 15,000mi' });
    tasks.push({ task: 'Wiper Blade Replacement', importance: 'low', interval: '12mo' });
  }

  // 2 Years or approx 30k miles
  if (cycle6mo % 4 === 0) {
    tasks.push({ task: 'Engine Air Filter', importance: 'medium', interval: '24mo / 30,000mi' });
    tasks.push({ task: 'Brake Fluid Exchange', importance: 'high', interval: '24mo / 30,000mi' });
    tasks.push({ task: 'Fuel System Cleaner', importance: 'low', interval: '24mo' });
  }

  // 4 Years or approx 60k miles
  if (cycle6mo % 8 === 0) {
    tasks.push({ task: 'Spark Plug Replacement', importance: 'high', interval: '48mo / 60,000mi' });
    tasks.push({ task: 'Engine Coolant Service', importance: 'high', interval: '48mo / 60,000mi' });
    tasks.push({ task: 'Drive Belt Inspection', importance: 'medium', interval: '48mo' });
  }

  return tasks;
}

export function getMonthsOwned(soldDateStr: string): number {
  if (!soldDateStr) return 0;
  const soldDate = new Date(soldDateStr + 'T00:00:00');
  if (isNaN(soldDate.getTime())) return 0;
  
  const now = new Date();
  const diffTime = now.getTime() - soldDate.getTime();
  const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375)); // Average month length
  return diffMonths;
}
