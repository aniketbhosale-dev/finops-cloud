import type { BillingRecord, Forecast } from './types';

export class ForecastingEngine {
  static generate(records: BillingRecord[], dailySpend: Record<string, number>, currentMonthSpend: number): Forecast[] {
    // Sort daily keys
    const sortedDates = Object.keys(dailySpend).sort();
    const n = sortedDates.length;

    if (n === 0) {
      return [
        { period: 'EOM', predictedCost: 0, confidence: 50, lowerBound: 0, upperBound: 0 },
        { period: 'EOQ', predictedCost: 0, confidence: 50, lowerBound: 0, upperBound: 0 },
        { period: 'Yearly', predictedCost: 0, confidence: 50, lowerBound: 0, upperBound: 0 }
      ];
    }

    const dailyCosts = sortedDates.map(date => dailySpend[date]);
    
    // Fit linear regression y = m * x + c
    // x = 0, 1, 2, ..., n-1
    // y = dailyCosts
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += dailyCosts[i];
      sumXY += i * dailyCosts[i];
      sumXX += i * i;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    // Calculate slope m and intercept c
    let m = 0;
    let c = meanY;

    if (n > 1) {
      const num = sumXY - n * meanX * meanY;
      const den = sumXX - n * meanX * meanX;
      m = den !== 0 ? num / den : 0;
      c = meanY - m * meanX;
    }

    // Ensure slope or projections don't run into negative daily costs
    const projectDailySpend = (dayIndex: number): number => {
      const pred = m * dayIndex + c;
      return Math.max(pred, 1.0); // minimum $1 daily cost
    };

    // Calculate standard deviation of residuals for confidence bounds
    let sumResidualSq = 0;
    for (let i = 0; i < n; i++) {
      const pred = m * i + c;
      sumResidualSq += Math.pow(dailyCosts[i] - pred, 2);
    }
    const stdDev = n > 1 ? Math.sqrt(sumResidualSq / (n - 1)) : 10;

    // Find date properties
    const latestDateStr = sortedDates[n - 1];
    const latestDate = new Date(latestDateStr);
    
    // 1. End of Month (EOM) Forecast
    const currentDay = latestDate.getDate();
    const daysInMonth = new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0).getDate();
    const remainingDaysInMonth = daysInMonth - currentDay;

    let eomProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInMonth; i++) {
      eomProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    const eomPredicted = currentMonthSpend + eomProjectedRemaining;
    const eomWidth = Math.max(stdDev * Math.sqrt(remainingDaysInMonth) * 1.64, eomPredicted * 0.05); // 90% confidence

    // 2. End of Quarter (EOQ) Forecast
    // Find remaining days in current quarter
    // Quarters: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
    const currentMonthIndex = latestDate.getMonth(); // 0-11
    const quarterEndMonthIndex = Math.floor(currentMonthIndex / 3) * 3 + 2; // 2, 5, 8, 11
    const quarterEndDate = new Date(latestDate.getFullYear(), quarterEndMonthIndex + 1, 0);
    const diffTime = quarterEndDate.getTime() - latestDate.getTime();
    const remainingDaysInQuarter = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let eoqProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInQuarter; i++) {
      eoqProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    // We assume current quarter cost is current month spend + previous months in quarter (which we approximate or sum from records)
    // For simplicity, we project from the current cumulative spend
    const currentQuarterSpendSoFar = currentMonthSpend; // Fallback to currentMonthSpend if we don't have full Q history
    const eoqPredicted = currentQuarterSpendSoFar + eoqProjectedRemaining;
    const eoqWidth = Math.max(stdDev * Math.sqrt(remainingDaysInQuarter) * 1.96, eoqPredicted * 0.1); // 95% confidence

    // 3. Yearly Forecast
    const daysInYear = 365;
    // Estimate remaining days in the year
    const startOfYear = new Date(latestDate.getFullYear(), 0, 1);
    const endOfYear = new Date(latestDate.getFullYear(), 11, 31);
    const dayOfYear = Math.floor((latestDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const remainingDaysInYear = daysInYear - dayOfYear;

    let yearlyProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInYear; i++) {
      yearlyProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    const currentYearSpendSoFar = currentMonthSpend * (dayOfYear / 30); // scale current month as baseline proxy
    const yearlyPredicted = currentYearSpendSoFar + yearlyProjectedRemaining;
    const yearlyWidth = Math.max(stdDev * Math.sqrt(remainingDaysInYear) * 1.96, yearlyPredicted * 0.15);

    // Calculate a confidence score between 0 and 100 based on standard deviation relative to mean spend
    const meanSpend = meanY;
    let confidence = 95;
    if (meanSpend > 0) {
      const cv = stdDev / meanSpend; // Coefficient of variation
      confidence = Math.max(60, Math.min(95, Math.round(95 - cv * 30)));
    }

    return [
      {
        period: 'EOM',
        predictedCost: Math.round(eomPredicted * 100) / 100,
        confidence,
        lowerBound: Math.max(10, Math.round((eomPredicted - eomWidth) * 100) / 100),
        upperBound: Math.round((eomPredicted + eomWidth) * 100) / 100
      },
      {
        period: 'EOQ',
        predictedCost: Math.round(eoqPredicted * 100) / 100,
        confidence: Math.max(50, confidence - 5), // lower confidence further out
        lowerBound: Math.max(10, Math.round((eoqPredicted - eoqWidth) * 100) / 100),
        upperBound: Math.round((eoqPredicted + eoqWidth) * 100) / 100
      },
      {
        period: 'Yearly',
        predictedCost: Math.round(yearlyPredicted * 100) / 100,
        confidence: Math.max(40, confidence - 15), // even lower confidence for year
        lowerBound: Math.max(10, Math.round((yearlyPredicted - yearlyWidth) * 100) / 100),
        upperBound: Math.round((yearlyPredicted + yearlyWidth) * 100) / 100
      }
    ];
  }
}
