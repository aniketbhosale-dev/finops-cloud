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

    // Decompose trend: separate trend component from noise
    // Use simple moving average (window=3) for smoothing
    const smoothedCosts: number[] = [];
    const windowSize = Math.min(3, n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(n, i + Math.floor(windowSize / 2) + 1);
      const slice = dailyCosts.slice(start, end);
      smoothedCosts.push(slice.reduce((s, v) => s + v, 0) / slice.length);
    }

    // Fit linear regression on smoothed data for trend
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += smoothedCosts[i];
      sumXY += i * smoothedCosts[i];
      sumXX += i * i;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    let m = 0;
    let c = meanY;

    if (n > 1) {
      const num = sumXY - n * meanX * meanY;
      const den = sumXX - n * meanX * meanX;
      m = den !== 0 ? num / den : 0;
      c = meanY - m * meanX;
    }

    // Project daily spend with trend extrapolation
    const projectDailySpend = (dayIndex: number): number => {
      const trendPred = m * dayIndex + c;
      // Blend with recent average for stability (80% trend, 20% recent avg)
      const recentAvg = dailyCosts.slice(Math.max(0, n - 5)).reduce((s, v) => s + v, 0) / Math.min(5, n);
      const blended = trendPred * 0.8 + recentAvg * 0.2;
      return Math.max(blended, 0.5);
    };

    // Calculate residuals on raw (not smoothed) data for confidence
    let sumResidualSq = 0;
    for (let i = 0; i < n; i++) {
      const pred = m * i + c;
      sumResidualSq += Math.pow(dailyCosts[i] - pred, 2);
    }
    const residualsStdDev = n > 1 ? Math.sqrt(sumResidualSq / (n - 1)) : meanY * 0.2;

    // Find date properties
    const latestDateStr = sortedDates[n - 1];
    const latestDate = new Date(latestDateStr);
    const currentDay = latestDate.getDate();
    const daysInMonth = new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0).getDate();
    const remainingDaysInMonth = daysInMonth - currentDay;

    // 1. End of Month (EOM) Forecast
    let eomProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInMonth; i++) {
      eomProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    const eomPredicted = currentMonthSpend + eomProjectedRemaining;
    // Wider confidence for EOM if high volatility
    const cv = meanY > 0 ? residualsStdDev / meanY : 0.2;
    const eomWidthFactor = 1.28 + cv * 2; // scales with volatility
    const eomWidth = Math.max(residualsStdDev * Math.sqrt(remainingDaysInMonth) * eomWidthFactor, eomPredicted * 0.04);

    // 2. End of Quarter (EOQ) Forecast
    const currentMonthIndex = latestDate.getMonth();
    const quarterEndMonthIndex = Math.floor(currentMonthIndex / 3) * 3 + 2;
    const quarterEndDate = new Date(latestDate.getFullYear(), quarterEndMonthIndex + 1, 0);
    const diffTime = quarterEndDate.getTime() - latestDate.getTime();
    const remainingDaysInQuarter = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let eoqProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInQuarter; i++) {
      eoqProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    const eoqPredicted = currentMonthSpend + eoqProjectedRemaining;
    const eoqWidthFactor = 1.96 + cv * 3;
    const eoqWidth = Math.max(residualsStdDev * Math.sqrt(remainingDaysInQuarter) * eoqWidthFactor, eoqPredicted * 0.08);

    // 3. Yearly Forecast
    const startOfYear = new Date(latestDate.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((latestDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const remainingDaysInYear = 365 - dayOfYear;

    let yearlyProjectedRemaining = 0;
    for (let i = 1; i <= remainingDaysInYear; i++) {
      yearlyProjectedRemaining += projectDailySpend(n - 1 + i);
    }
    // Estimate current year spend: scale current month as baseline
    const currentYearSpendSoFar = currentMonthSpend * (dayOfYear / 30);
    const yearlyPredicted = currentYearSpendSoFar + yearlyProjectedRemaining;
    const yearlyWidthFactor = 2.58 + cv * 5;
    const yearlyWidth = Math.max(residualsStdDev * Math.sqrt(remainingDaysInYear) * yearlyWidthFactor, yearlyPredicted * 0.12);

    // Confidence: based on coefficient of variation
    let confidence = 92;
    if (meanY > 0) {
      confidence = Math.max(55, Math.min(95, Math.round(92 - cv * 40)));
    }

    // Reduce confidence for longer horizons
    const eomConfidence = confidence;
    const eoqConfidence = Math.max(50, confidence - 8);
    const yearlyConfidence = Math.max(35, confidence - 18);

    return [
      {
        period: 'EOM',
        predictedCost: Math.round(eomPredicted * 100) / 100,
        confidence: eomConfidence,
        lowerBound: Math.max(10, Math.round((eomPredicted - eomWidth) * 100) / 100),
        upperBound: Math.round((eomPredicted + eomWidth) * 100) / 100
      },
      {
        period: 'EOQ',
        predictedCost: Math.round(eoqPredicted * 100) / 100,
        confidence: eoqConfidence,
        lowerBound: Math.max(10, Math.round((eoqPredicted - eoqWidth) * 100) / 100),
        upperBound: Math.round((eoqPredicted + eoqWidth) * 100) / 100
      },
      {
        period: 'Yearly',
        predictedCost: Math.round(yearlyPredicted * 100) / 100,
        confidence: yearlyConfidence,
        lowerBound: Math.max(10, Math.round((yearlyPredicted - yearlyWidth) * 100) / 100),
        upperBound: Math.round((yearlyPredicted + yearlyWidth) * 100) / 100
      }
    ];
  }
}
