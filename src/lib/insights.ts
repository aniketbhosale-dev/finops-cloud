import type {
  AnalysisResults, Anomaly, Recommendation, ExecutiveInsight,
  ServiceTrend, PeriodComparison, WasteAnalysis, CostEfficiency, TrendAnalysis
} from './types';

const fmt = (val: number) => {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${Math.round(val)}`;
};

export function generateInsights(results: AnalysisResults): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  let id = 1;

  // ── Spend Insights ──────────────────────────────────────────
  const { periodComparison: pc, trend, efficiency, waste, budgetUtilization, budgetLimit } = results;

  // Period comparison insight
  if (pc.direction === 'up' && Math.abs(pc.changePercentage) > 2) {
    insights.push({
      id: `ins-${id++}`,
      type: pc.changePercentage > 15 ? 'critical' : 'warning',
      category: 'spend',
      title: `Spending increased ${pc.changePercentage.toFixed(1)}% vs prior period`,
      message: `Current month spend is ${fmt(pc.currentPeriod.spend)} vs ${fmt(pc.normalizedComparison)} normalized from last period. Daily average is ${fmt(pc.dailyAvgCurrent)}/day (${pc.dailyAvgPrevious > 0 ? (pc.dailyAvgCurrent > pc.dailyAvgPrevious ? '+' : '') + (((pc.dailyAvgCurrent - pc.dailyAvgPrevious) / pc.dailyAvgPrevious) * 100).toFixed(1) : 'N/A'}% vs prior).`,
      metric: `${pc.changePercentage > 0 ? '+' : ''}${pc.changePercentage.toFixed(1)}%`,
      impact: `${fmt(Math.abs(pc.changeAbsolute))} ${pc.direction === 'up' ? 'over' : 'under'} prior period`
    });
  } else if (pc.direction === 'down' && Math.abs(pc.changePercentage) > 5) {
    insights.push({
      id: `ins-${id++}`,
      type: 'success',
      category: 'spend',
      title: `Spending decreased ${Math.abs(pc.changePercentage).toFixed(1)}% vs prior period`,
      message: `Cost optimization is working. Spend dropped from ${fmt(pc.normalizedComparison)} (normalized) to ${fmt(pc.currentPeriod.spend)}. Daily average: ${fmt(pc.dailyAvgCurrent)}/day.`,
      metric: `${pc.changePercentage.toFixed(1)}%`,
      impact: `${fmt(Math.abs(pc.changeAbsolute))} saved vs prior period`
    });
  }

  // Burn rate vs budget
  if (trend.burnRate > budgetLimit) {
    const overPct = ((trend.burnRate - budgetLimit) / budgetLimit * 100).toFixed(0);
    insights.push({
      id: `ins-${id++}`,
      type: 'critical',
      category: 'forecast',
      title: `Burn rate exceeds budget by ${overPct}%`,
      message: `Current daily spending pace projects to ${fmt(trend.burnRate)}/month, which is ${fmt(trend.burnRate - budgetLimit)} over the ${fmt(budgetLimit)} budget. Without intervention, the budget will be exceeded.`,
      metric: fmt(trend.burnRate),
      impact: `${fmt(trend.burnRate - budgetLimit)} projected overage`
    });
  } else if (budgetUtilization > 90) {
    insights.push({
      id: `ins-${id++}`,
      type: 'warning',
      category: 'spend',
      title: `Budget ${budgetUtilization.toFixed(0)}% utilized`,
      message: `At the current pace, spending may exceed the ${fmt(budgetLimit)} budget before month end. Current spend: ${fmt(results.currentMonthSpend)}.`,
      metric: `${budgetUtilization.toFixed(0)}%`,
      impact: `${fmt(budgetLimit - results.currentMonthSpend)} remaining`
    });
  }

  // Trend direction
  if (trend.direction === 'increasing' && trend.momentum > 0) {
    insights.push({
      id: `ins-${id++}`,
      type: 'warning',
      category: 'spend',
      title: 'Spending trend is accelerating',
      message: `Daily costs are increasing at ${fmt(trend.dailyChangeRate)}/day and the rate is accelerating. If this continues, next month could see significantly higher costs.`,
      metric: `+${fmt(trend.dailyChangeRate)}/day`,
      impact: 'Accelerating trend'
    });
  } else if (trend.direction === 'decreasing' && trend.momentum < 0) {
    insights.push({
      id: `ins-${id++}`,
      type: 'success',
      category: 'spend',
      title: 'Spending trend is decelerating',
      message: `Costs are declining at ${fmt(Math.abs(trend.dailyChangeRate))}/day and the decline is accelerating. Cost optimization measures appear effective.`,
      metric: `${fmt(trend.dailyChangeRate)}/day`,
      impact: 'Decelerating costs'
    });
  }

  // High volatility
  if (trend.volatility > 40) {
    insights.push({
      id: `ins-${id++}`,
      type: 'warning',
      category: 'efficiency',
      title: `High cost volatility detected (${trend.volatility.toFixed(0)}%)`,
      message: `Daily spending varies significantly (coefficient of variation: ${trend.volatility.toFixed(0)}%). This makes forecasting difficult and may indicate inconsistent resource utilization.`,
      metric: `${trend.volatility.toFixed(0)}% CV`,
      impact: 'Unpredictable costs'
    });
  }

  // ── Waste Insights ──────────────────────────────────────────
  if (waste.totalWaste > 0) {
    const wasteItems = [];
    if (waste.zombieCost > 0) wasteItems.push(`${fmt(waste.zombieCost)} in zombie resources`);
    if (waste.idleCost > 0) wasteItems.push(`${fmt(waste.idleCost)} in idle resources`);
    if (waste.underutilizedCost > 0) wasteItems.push(`${fmt(waste.underutilizedCost)} in underutilized resources`);

    insights.push({
      id: `ins-${id++}`,
      type: waste.wasteRatio > 15 ? 'critical' : waste.wasteRatio > 8 ? 'warning' : 'info',
      category: 'waste',
      title: `${fmt(waste.totalWaste)} in identified waste (${waste.wasteRatio.toFixed(1)}% of total)`,
      message: `Detected waste: ${wasteItems.join(', ')}. Recoverable savings estimated at ${fmt(waste.recoverableSavings)}/month through right-sizing and cleanup.`,
      metric: `${waste.wasteRatio.toFixed(1)}%`,
      impact: `${fmt(waste.recoverableSavings)} recoverable`
    });
  }

  // ── Anomaly Insights ────────────────────────────────────────
  const highAnomalies = results.anomalies.filter(a => a.severity === 'high');
  if (highAnomalies.length > 0) {
    const topAnomaly = highAnomalies[0];
    const totalAnomalyImpact = highAnomalies.reduce((s, a) => s + (a.cost - a.previousAverage), 0);
    insights.push({
      id: `ins-${id++}`,
      type: 'critical',
      category: 'anomaly',
      title: `${highAnomalies.length} high-severity cost spike${highAnomalies.length > 1 ? 's' : ''} detected`,
      message: `Largest spike: ${topAnomaly.service} on ${topAnomaly.date} reached ${fmt(topAnomaly.cost)} (+${topAnomaly.percentageSpike}% vs avg ${fmt(topAnomaly.previousAverage)}). Combined anomaly impact: ~${fmt(totalAnomalyImpact)} over baseline.`,
      metric: `+${topAnomaly.percentageSpike}%`,
      impact: `~${fmt(totalAnomalyImpact)} over baseline`
    });
  }

  // ── Efficiency Insights ─────────────────────────────────────
  if (efficiency.topServiceConcentration > 60) {
    const topServices = results.breakdown.service;
    const sorted = Object.entries(topServices).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3);
    insights.push({
      id: `ins-${id++}`,
      type: 'info',
      category: 'efficiency',
      title: `Top 3 services account for ${efficiency.topServiceConcentration.toFixed(0)}% of spend`,
      message: `Cost concentration: ${top3.map(([s, c]) => `${s} (${fmt(c)})`).join(', ')}. This ${efficiency.topServiceConcentration > 80 ? 'high' : 'moderate'} concentration means optimization of these services will have outsized impact.`,
      metric: `${efficiency.topServiceConcentration.toFixed(0)}%`,
      impact: 'High-impact optimization targets'
    });
  }

  // Service with highest cost increase
  const risingServices = results.serviceTrends.filter(t => t.direction === 'up' && t.riskLevel !== 'low');
  if (risingServices.length > 0) {
    const top = risingServices[0];
    insights.push({
      id: `ins-${id++}`,
      type: top.riskLevel === 'high' ? 'critical' : 'warning',
      category: 'spend',
      title: `${top.service} costs trending up ${top.changePercent.toFixed(1)}%`,
      message: `${top.service} increased from ${fmt(top.previousCost)} to ${fmt(top.currentCost)} in the second half of the period. Current daily average: ${fmt(top.dailyAvg)}/day.`,
      metric: `+${top.changePercent.toFixed(1)}%`,
      impact: `${fmt(top.currentCost - top.previousCost)} increase`
    });
  }

  // ── Recommendation Insights ─────────────────────────────────
  const totalSavings = results.recommendations.reduce((s, r) => s + r.potentialSavings, 0);
  const highImpactRecs = results.recommendations.filter(r => r.impact === 'high');
  if (totalSavings > 0) {
    insights.push({
      id: `ins-${id++}`,
      type: totalSavings > results.currentMonthSpend * 0.15 ? 'warning' : 'info',
      category: 'recommendation',
      title: `${fmt(totalSavings)}/mo in potential savings identified`,
      message: `${results.recommendations.length} recommendations found. ${highImpactRecs.length} high-impact actions could save ${fmt(highImpactRecs.reduce((s, r) => s + r.potentialSavings, 0))}/mo. Top opportunity: ${results.recommendations[0]?.title || 'N/A'}.`,
      metric: fmt(totalSavings),
      impact: `${highImpactRecs.length} high-impact actions`
    });
  }

  // ── Forecast Insights ───────────────────────────────────────
  const eomForecast = results.forecasts.find(f => f.period === 'EOM');
  if (eomForecast && eomForecast.predictedCost > budgetLimit) {
    insights.push({
      id: `ins-${id++}`,
      type: 'critical',
      category: 'forecast',
      title: `EOM forecast ${fmt(eomForecast.predictedCost)} exceeds budget`,
      message: `End-of-month projection: ${fmt(eomForecast.predictedCost)} (confidence: ${eomForecast.confidence}%). Range: ${fmt(eomForecast.lowerBound)} - ${fmt(eomForecast.upperBound)}. Budget: ${fmt(budgetLimit)}.`,
      metric: fmt(eomForecast.predictedCost),
      impact: `${fmt(eomForecast.predictedCost - budgetLimit)} projected overage`
    });
  }

  // Sort by priority: critical > warning > info > success
  const priority = { critical: 0, warning: 1, info: 2, success: 3 };
  insights.sort((a, b) => priority[a.type] - priority[b.type]);

  return insights;
}
