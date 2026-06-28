import type {
  BillingRecord, AnalysisResults, CloudProvider, HiddenCostDetail,
  TrendAnalysis, PeriodComparison, CostEfficiency, WasteAnalysis,
  ServiceTrend, CostAllocation, AllocationEntry
} from './types';

function getWeekStartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function getMonthString(dateStr: string): string {
  return dateStr.substring(0, 7);
}

function getDaysInMonth(dateStr: string): number {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// ── Trend Analysis ──────────────────────────────────────────────
function computeTrendAnalysis(dailySpend: Record<string, number>): TrendAnalysis {
  const sortedDates = Object.keys(dailySpend).sort();
  const n = sortedDates.length;
  if (n === 0) {
    return {
      direction: 'stable', dailyChangeRate: 0, weeklyChangeRate: 0, volatility: 0,
      burnRate: 0, peakDay: '', peakCost: 0, lowestDay: '', lowestCost: 0, momentum: 0
    };
  }

  const costs = sortedDates.map(d => dailySpend[d]);
  const mean = costs.reduce((s, v) => s + v, 0) / n;

  let peakIdx = 0, lowIdx = 0;
  for (let i = 1; i < n; i++) {
    if (costs[i] > costs[peakIdx]) peakIdx = i;
    if (costs[i] < costs[lowIdx]) lowIdx = i;
  }

  // Linear regression
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += costs[i]; sumXY += i * costs[i]; sumXX += i * i;
  }
  const meanX = sumX / n;
  const slope = n > 1 ? (sumXY - n * meanX * (sumY / n)) / (sumXX - n * meanX * meanX) : 0;

  const dailyChangeRate = Math.round(slope * 100) / 100;
  const weeklyChangeRate = Math.round(slope * 7 * 100) / 100;

  const variance = costs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? Math.round((stdDev / mean) * 10000) / 100 : 0;
  const burnRate = Math.round(mean * 30 * 100) / 100;

  const changeThreshold = mean * 0.05;
  let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (slope > changeThreshold) direction = 'increasing';
  else if (slope < -changeThreshold) direction = 'decreasing';

  // Momentum: compare slope of first half vs second half
  let momentum = 0;
  if (n >= 4) {
    const mid = Math.floor(n / 2);
    const firstHalf = costs.slice(0, mid);
    const secondHalf = costs.slice(mid);
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    momentum = mean > 0 ? Math.max(-1, Math.min(1, (avgSecond - avgFirst) / mean)) : 0;
    momentum = Math.round(momentum * 100) / 100;
  }

  return {
    direction, dailyChangeRate, weeklyChangeRate, volatility, burnRate,
    peakDay: sortedDates[peakIdx], peakCost: Math.round(costs[peakIdx] * 100) / 100,
    lowestDay: sortedDates[lowIdx], lowestCost: Math.round(costs[lowIdx] * 100) / 100,
    momentum
  };
}

// ── Period Comparison ───────────────────────────────────────────
function computePeriodComparison(
  dailySpend: Record<string, number>,
  currentMonthSpend: number,
  latestMonth: string
): PeriodComparison {
  const sortedDates = Object.keys(dailySpend).sort();
  if (sortedDates.length === 0) {
    return {
      currentPeriod: { label: latestMonth, spend: 0, days: 0 },
      previousPeriod: { label: '', spend: 0, days: 0 },
      changeAbsolute: 0, changePercentage: 0, direction: 'flat',
      dailyAvgCurrent: 0, dailyAvgPrevious: 0, normalizedComparison: 0
    };
  }

  // Split into current and previous month
  const currentDates = sortedDates.filter(d => d.startsWith(latestMonth));
  const prevMonthDate = new Date(latestMonth + '-01');
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = getMonthString(prevMonthDate.toISOString().split('T')[0]);
  const prevDates = sortedDates.filter(d => d.startsWith(prevMonth));

  const currentSpend = currentDates.reduce((s, d) => s + dailySpend[d], 0);
  const prevSpend = prevDates.reduce((s, d) => s + dailySpend[d], 0);
  const currentDays = currentDates.length || 1;
  const prevDays = prevDates.length || 1;

  const dailyAvgCurrent = currentSpend / currentDays;
  const dailyAvgPrevious = prevSpend / prevDays;

  // Normalize: project what previous month would have been if it had same # of days
  const normalizedPrev = dailyAvgPrevious * currentDays;
  const changeAbsolute = Math.round((currentSpend - normalizedPrev) * 100) / 100;
  const changePercentage = normalizedPrev > 0
    ? Math.round(((currentSpend - normalizedPrev) / normalizedPrev) * 10000) / 100
    : currentSpend > 0 ? 100 : 0;

  let direction: 'up' | 'down' | 'flat' = 'flat';
  if (changePercentage > 2) direction = 'up';
  else if (changePercentage < -2) direction = 'down';

  return {
    currentPeriod: { label: latestMonth, spend: Math.round(currentSpend * 100) / 100, days: currentDays },
    previousPeriod: { label: prevMonth, spend: Math.round(prevSpend * 100) / 100, days: prevDays },
    changeAbsolute, changePercentage, direction,
    dailyAvgCurrent: Math.round(dailyAvgCurrent * 100) / 100,
    dailyAvgPrevious: Math.round(dailyAvgPrevious * 100) / 100,
    normalizedComparison: Math.round(normalizedPrev * 100) / 100
  };
}

// ── Cost Efficiency ─────────────────────────────────────────────
function computeEfficiency(
  totalSpend: number,
  serviceMap: Record<string, number>,
  regionMap: Record<string, number>,
  days: number
): CostEfficiency {
  const costPerDay = days > 0 ? Math.round((totalSpend / days) * 100) / 100 : 0;
  const serviceCount = Object.keys(serviceMap).length || 1;
  const regionCount = Object.keys(regionMap).length || 1;

  // Top 3 service concentration
  const sortedServices = Object.entries(serviceMap).sort((a, b) => b[1] - a[1]);
  const top3Cost = sortedServices.slice(0, 3).reduce((s, [, v]) => s + v, 0);
  const topServiceConcentration = totalSpend > 0
    ? Math.round((top3Cost / totalSpend) * 10000) / 100
    : 0;

  // Pareto: how many services account for 80% of spend
  let paretoCumulative = 0;
  let paretoCount = 0;
  const totalForPareto = sortedServices.reduce((s, [, v]) => s + v, 0);
  for (const [, v] of sortedServices) {
    paretoCumulative += v;
    paretoCount++;
    if (paretoCumulative >= totalForPareto * 0.8) break;
  }
  const paretoprinciple = serviceCount > 0
    ? Math.round((paretoCount / serviceCount) * 10000) / 100
    : 0;

  // Gini coefficient for spend distribution
  const values = Object.values(serviceMap).sort((a, b) => a - b);
  const n = values.length;
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * values[i];
  }
  const meanVal = totalSpend / n || 1;
  const giniCoefficient = n > 0 ? Math.max(0, Math.min(1, giniSum / (n * n * meanVal))) : 0;

  return {
    costPerDay,
    costPerService: Math.round((totalSpend / serviceCount) * 100) / 100,
    costPerRegion: Math.round((totalSpend / regionCount) * 100) / 100,
    topServiceConcentration,
    paretoprinciple,
    giniCoefficient: Math.round(giniCoefficient * 1000) / 1000
  };
}

// ── Waste Analysis ──────────────────────────────────────────────
function computeWasteAnalysis(
  records: BillingRecord[],
  healthStatus: { idle: ResourceDetail[]; zombie: ResourceDetail[]; underutilized: ResourceDetail[]; overutilized: ResourceDetail[] },
  hiddenCosts: HiddenCostDetail[],
  totalSpend: number
): WasteAnalysis {
  const zombieCost = healthStatus.zombie.reduce((s, r) => s + r.cost, 0);
  const idleCost = healthStatus.idle.reduce((s, r) => s + r.cost, 0);
  const underutilizedCost = healthStatus.underutilized.reduce((s, r) => s + r.cost, 0);
  // Over-provisioned: estimated 40% waste from underutilized resources
  const overprovisionedCost = Math.round(underutilizedCost * 0.4 * 100) / 100;

  const totalWaste = Math.round((zombieCost + idleCost + underutilizedCost) * 100) / 100;
  const wasteRatio = totalSpend > 0 ? Math.round((totalWaste / totalSpend) * 10000) / 100 : 0;
  const recoverableSavings = Math.round(totalWaste * 0.85 * 100) / 100; // 85% of waste is recoverable

  // Waste by category from hidden costs
  const wasteByCategory: Record<string, number> = {};
  hiddenCosts.forEach(h => {
    wasteByCategory[h.category] = (wasteByCategory[h.category] || 0) + h.cost;
  });

  // Waste by provider (only relevant for multi-cloud, but still useful)
  const wasteByProvider: Record<string, number> = {};
  healthStatus.zombie.forEach(r => { wasteByProvider[r.provider] = (wasteByProvider[r.provider] || 0) + r.cost; });
  healthStatus.idle.forEach(r => { wasteByProvider[r.provider] = (wasteByProvider[r.provider] || 0) + r.cost; });
  healthStatus.underutilized.forEach(r => { wasteByProvider[r.provider] = (wasteByProvider[r.provider] || 0) + r.cost; });

  return {
    totalWaste, wasteRatio, zombieCost, idleCost, underutilizedCost,
    overprovisionedCost, recoverableSavings, wasteByCategory, wasteByProvider
  };
}

// ── Service Trends ──────────────────────────────────────────────
function computeServiceTrends(
  records: BillingRecord[],
  dailySpend: Record<string, number>
): ServiceTrend[] {
  // Group by service and date
  const serviceDaily: Record<string, Record<string, number>> = {};
  records.forEach(r => {
    if (!serviceDaily[r.service]) serviceDaily[r.service] = {};
    serviceDaily[r.service][r.date] = (serviceDaily[r.service][r.date] || 0) + r.cost;
  });

  const sortedDates = Object.keys(dailySpend).sort();
  const n = sortedDates.length;
  if (n < 2) return [];

  const mid = Math.floor(n / 2);
  const firstHalfDates = sortedDates.slice(0, mid);
  const secondHalfDates = sortedDates.slice(mid);

  return Object.entries(serviceDaily).map(([service, dateMap]) => {
    const firstHalfCost = firstHalfDates.reduce((s, d) => s + (dateMap[d] || 0), 0);
    const secondHalfCost = secondHalfDates.reduce((s, d) => s + (dateMap[d] || 0), 0);
    const totalServiceCost = Object.values(dateMap).reduce((s, v) => s + v, 0);

    const avgFirst = firstHalfDates.length > 0 ? firstHalfCost / firstHalfDates.length : 0;
    const avgSecond = secondHalfDates.length > 0 ? secondHalfCost / secondHalfDates.length : 0;

    const dailyAvg = n > 0 ? totalServiceCost / n : 0;
    const changePercent = avgFirst > 0
      ? Math.round(((avgSecond - avgFirst) / avgFirst) * 10000) / 100
      : avgSecond > 0 ? 100 : 0;

    let direction: 'up' | 'down' | 'flat' = 'flat';
    if (changePercent > 5) direction = 'up';
    else if (changePercent < -5) direction = 'down';

    // Trend slope for this service
    const serviceDates = Object.keys(dateMap).sort();
    const costs = serviceDates.map(d => dateMap[d]);
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < costs.length; i++) {
      sumX += i; sumY += costs[i]; sumXY += i * costs[i]; sumXX += i * i;
    }
    const meanX = sumX / costs.length;
    const slope = costs.length > 1
      ? (sumXY - costs.length * meanX * (sumY / costs.length)) / (sumXX - costs.length * meanX * meanX)
      : 0;

    // Risk level based on change magnitude and current cost
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (changePercent > 30 && totalServiceCost > 100) riskLevel = 'high';
    else if (changePercent > 15 || (changePercent > 5 && totalServiceCost > 500)) riskLevel = 'medium';

    return {
      service,
      currentCost: Math.round(secondHalfCost * 100) / 100,
      previousCost: Math.round(firstHalfCost * 100) / 100,
      changePercent,
      direction,
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      trendSlope: Math.round(slope * 100) / 100,
      riskLevel
    };
  }).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

// ── Cost Allocation ─────────────────────────────────────────────
function computeAllocation(
  records: BillingRecord[],
  totalSpend: number,
  dailySpend: Record<string, number>
): CostAllocation {
  const n = Object.keys(dailySpend).length || 1;

  const buildEntries = (groupFn: (r: BillingRecord) => string): AllocationEntry[] => {
    const map: Record<string, number> = {};
    records.forEach(r => {
      const key = groupFn(r);
      map[key] = (map[key] || 0) + r.cost;
    });

    return Object.entries(map)
      .map(([name, cost]) => ({
        name,
        cost: Math.round(cost * 100) / 100,
        percentage: totalSpend > 0 ? Math.round((cost / totalSpend) * 10000) / 100 : 0,
        trend: 'stable' as const,
        dailyAvg: Math.round((cost / n) * 100) / 100
      }))
      .sort((a, b) => b.cost - a.cost);
  };

  const byService = buildEntries(r => r.service);
  const byRegion = buildEntries(r => r.region);
  const byEnvironment = buildEntries(r => r.environment);
  const byTeam = buildEntries(r => r.team);
  const byApplication = buildEntries(r => r.application);

  // Compute trends for top entries
  const computeTrend = (entries: AllocationEntry[], groupFn: (r: BillingRecord) => string) => {
    const sortedDates = Object.keys(dailySpend).sort();
    if (sortedDates.length < 4) return;
    const mid = Math.floor(sortedDates.length / 2);
    const firstDates = sortedDates.slice(0, mid);
    const secondDates = sortedDates.slice(mid);

    entries.slice(0, 5).forEach(entry => {
      const firstCost = records.filter(r => groupFn(r) === entry.name && firstDates.includes(r.date))
        .reduce((s, r) => s + r.cost, 0);
      const secondCost = records.filter(r => groupFn(r) === entry.name && secondDates.includes(r.date))
        .reduce((s, r) => s + r.cost, 0);
      const avgFirst = firstDates.length > 0 ? firstCost / firstDates.length : 0;
      const avgSecond = secondDates.length > 0 ? secondCost / secondDates.length : 0;
      const change = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
      if (change > 5) entry.trend = 'up';
      else if (change < -5) entry.trend = 'down';
    });
  };

  computeTrend(byService, r => r.service);
  computeTrend(byRegion, r => r.region);
  computeTrend(byEnvironment, r => r.environment);
  computeTrend(byTeam, r => r.team);
  computeTrend(byApplication, r => r.application);

  return { byService, byRegion, byEnvironment, byTeam, byApplication };
}

// ── Hidden Cost Scanner ─────────────────────────────────────────
export function scanHiddenCosts(records: BillingRecord[]): HiddenCostDetail[] {
  const hiddenCosts: HiddenCostDetail[] = [];
  let idCounter = 1;

  records.forEach(r => {
    let isHidden = false;
    let category = '';
    let details = '';

    if (r.provider === 'aws') {
      const s = r.service.toLowerCase();
      const u = r.resourceGroup.toLowerCase();

      if (u.includes('natgateway') || s.includes('natgateway') || s === 'amazonvpc') {
        isHidden = true; category = 'NAT Gateway';
        details = 'Hourly charge for NAT Gateway endpoints and data processing rates.';
      } else if (u.includes('elasticip:idle') || u.includes('idleaddress') || s === 'elasticip') {
        isHidden = true; category = 'Elastic IP';
        details = 'Charges for public IP addresses allocated but not attached to running instances.';
      } else if (u.includes('publicipv4') || u.includes('ipv4') || s.includes('publicipv4')) {
        isHidden = true; category = 'Public IPv4';
        details = 'Standard AWS charge ($0.005/hour) for all public IPv4 addresses.';
      } else if (u.includes('regional-bytes') || u.includes('datatransfer-regional') || u.includes('intrazone')) {
        isHidden = true; category = 'Cross-AZ Traffic';
        details = 'Data transfer fees between separate AWS Availability Zones.';
      } else if (u.includes('interregion') || s === 'awssdatatransfer') {
        isHidden = true; category = 'Inter-Region Transfer';
        details = 'Data transfer charges between different AWS regions.';
      } else if (s.includes('cloudwatch') || s === 'amazoncloudwatch') {
        isHidden = true; category = 'CloudWatch';
        details = 'Charges for log ingestion, storage, and retention.';
      } else if (s.includes('cloudtrail') || s === 'awscloudtrail') {
        isHidden = true; category = 'CloudTrail';
        details = 'Charges for management and data events audit trails.';
      } else if (u.includes('snapshot') || (s === 'amazonec2' && u.includes('ebs:snapshot'))) {
        isHidden = true; category = 'Snapshots';
        details = 'Backup storage costs for EBS volume snapshots.';
      } else if (u.includes('ebs:volume') || (s === 'amazonec2' && u.includes('ebs:volume'))) {
        isHidden = true; category = 'EBS Volumes';
        details = 'Cost for provisioned EBS block storage volumes.';
      } else if (s === 'awselb' || s === 'elasticloadbalancing' || u.includes('loadbalancing')) {
        isHidden = true; category = 'Load Balancers';
        details = 'Charges for ALB/NLB running with low or no requests.';
      } else if (s.includes('apigateway')) {
        isHidden = true; category = 'API Gateway';
        details = 'API Gateway execution costs based on request volumes.';
      } else if (s === 'awskms' || s === 'kms') {
        isHidden = true; category = 'KMS';
        details = 'Costs from Key Management Service requests and active keys.';
      } else if (s.includes('secretsmanager')) {
        isHidden = true; category = 'Secrets Manager';
        details = 'Charges for hosting active secrets and request counts.';
      } else if (s.includes('route53')) {
        isHidden = true; category = 'Route53';
        details = 'Monthly charge for hosted DNS zones and queries.';
      } else if (s === 'amazons3' && u.includes('requests')) {
        isHidden = true; category = 'S3 Requests';
        details = 'Charges for S3 API operations (PUT, GET, LIST).';
      }
    } else if (r.provider === 'azure') {
      const s = r.service.toLowerCase();
      if (s.includes('public ip')) {
        isHidden = true; category = 'Public IP';
        details = 'Charges for idle or active public IP addresses.';
      } else if (s.includes('managed disks') || s.includes('disk')) {
        isHidden = true; category = 'Managed Disks';
        details = 'Provisioned Azure disk storage capacity cost.';
      } else if (s.includes('log analytics') || s.includes('monitor')) {
        isHidden = true; category = 'Log Analytics';
        details = 'Data ingestion costs and log workspace retention.';
      } else if (s.includes('backup') || s.includes('recovery services')) {
        isHidden = true; category = 'Backup Vault';
        details = 'Azure recovery vaults storage charges.';
      } else if (s.includes('firewall')) {
        isHidden = true; category = 'Azure Firewall';
        details = 'Azure Firewall deployment hours and data processing.';
      } else if (s.includes('vpn gateway') || s.includes('network gateway')) {
        isHidden = true; category = 'VPN Gateway';
        details = 'Charges for provisioning VPN connections.';
      } else if (s.includes('data transfer') || s.includes('bandwidth')) {
        isHidden = true; category = 'Data Transfer';
        details = 'Charges for network egress traffic.';
      }
    } else if (r.provider === 'gcp') {
      const s = r.service.toLowerCase();
      const res = r.resourceId.toLowerCase();
      if (s.includes('cloud nat') || s.includes('nat')) {
        isHidden = true; category = 'Cloud NAT';
        details = 'Hourly NAT gateway charges and traffic processing.';
      } else if (res.includes('static-ip') || res.includes('static_ip') || (s.includes('compute') && res.includes('ip'))) {
        isHidden = true; category = 'Static IP';
        details = 'Charges for unused external IP addresses.';
      } else if (s.includes('logging') || s.includes('stackdriver')) {
        isHidden = true; category = 'Logging';
        details = 'Ingestion and storage costs for Cloud Logging.';
      } else if (s.includes('storage') && (res.includes('ops') || res.includes('operations'))) {
        isHidden = true; category = 'Storage Operations';
        details = 'Class A and Class B API operation request fees.';
      } else if (s.includes('compute') && (res.includes('traffic') || res.includes('network') || res.includes('egress'))) {
        isHidden = true; category = 'Inter-zone Traffic';
        details = 'Data transfer costs between VMs in different zones.';
      } else if (res.includes('snapshot') || (s.includes('storage') && res.includes('snap'))) {
        isHidden = true; category = 'Snapshot Storage';
        details = 'Backup storage costs for VM disk snapshots.';
      }
    }

    if (isHidden) {
      hiddenCosts.push({
        id: `hc-${r.provider}-${idCounter++}`,
        category, service: r.service, cost: r.cost, details, provider: r.provider
      });
    }
  });

  return hiddenCosts;
}

// ── Main Analyzer ───────────────────────────────────────────────
export class CostAnalyzer {
  static analyze(
    records: BillingRecord[],
    healthStatus?: { idle: ResourceDetail[]; zombie: ResourceDetail[]; underutilized: ResourceDetail[]; overutilized: ResourceDetail[] }
  ): Omit<AnalysisResults, 'anomalies' | 'recommendations' | 'forecasts' | 'insights'> {
    if (records.length === 0) {
      throw new Error('Cannot analyze empty record list');
    }

    const provider = records[0].provider;
    let totalSpend = 0;

    const serviceMap: Record<string, number> = {};
    const regionMap: Record<string, number> = {};
    const accountMap: Record<string, number> = {};
    const environmentMap: Record<string, number> = {};
    const teamMap: Record<string, number> = {};
    const applicationMap: Record<string, number> = {};
    const tagMap: Record<string, Record<string, number>> = {};

    const dailyMap: Record<string, number> = {};
    const weeklyMap: Record<string, number> = {};
    const monthlyMap: Record<string, number> = {};

    let latestDateStr = '1970-01-01';
    records.forEach(r => {
      if (r.date > latestDateStr) latestDateStr = r.date;
    });

    const latestMonth = getMonthString(latestDateStr);
    let currentMonthSpend = 0;

    records.forEach(r => {
      const cost = r.cost;
      totalSpend += cost;
      if (getMonthString(r.date) === latestMonth) currentMonthSpend += cost;

      serviceMap[r.service] = (serviceMap[r.service] || 0) + cost;
      regionMap[r.region] = (regionMap[r.region] || 0) + cost;
      accountMap[r.account] = (accountMap[r.account] || 0) + cost;
      environmentMap[r.environment] = (environmentMap[r.environment] || 0) + cost;
      teamMap[r.team] = (teamMap[r.team] || 0) + cost;
      applicationMap[r.application] = (applicationMap[r.application] || 0) + cost;

      Object.entries(r.tags).forEach(([k, v]) => {
        if (!tagMap[k]) tagMap[k] = {};
        tagMap[k][v] = (tagMap[k][v] || 0) + cost;
      });

      dailyMap[r.date] = (dailyMap[r.date] || 0) + cost;
      const week = getWeekStartDate(r.date);
      weeklyMap[week] = (weeklyMap[week] || 0) + cost;
      const month = getMonthString(r.date);
      monthlyMap[month] = (monthlyMap[month] || 0) + cost;
    });

    // EOM estimation
    const latestDate = new Date(latestDateStr);
    const dayOfLatest = latestDate.getDate();
    const yearOfLatest = latestDate.getFullYear();
    const monthOfLatest = latestDate.getMonth();
    const totalDaysInMonth = new Date(yearOfLatest, monthOfLatest + 1, 0).getDate();
    const daysInLatestMonth = Object.keys(dailyMap).filter(d => d.startsWith(latestMonth)).length;
    const daysDivider = daysInLatestMonth > 0 ? daysInLatestMonth : Math.min(dayOfLatest, 28);
    const estimatedEomCost = (currentMonthSpend / daysDivider) * totalDaysInMonth;

    // Budget
    const budgetLimits: Record<CloudProvider, number> = { aws: 10000, azure: 8000, gcp: 6000 };
    const budgetLimit = budgetLimits[provider] || 5000;
    const budgetUtilization = (currentMonthSpend / budgetLimit) * 100;

    // Hidden costs
    const hiddenCosts = scanHiddenCosts(records);
    const totalHiddenCost = hiddenCosts.reduce((sum, h) => sum + h.cost, 0);

    // New analyses
    const trend = computeTrendAnalysis(dailyMap);
    const periodComparison = computePeriodComparison(dailyMap, currentMonthSpend, latestMonth);
    const totalDays = Object.keys(dailyMap).length;
    const efficiency = computeEfficiency(totalSpend, serviceMap, regionMap, totalDays);

    // Waste analysis (needs healthStatus, default to empty)
    const hs = healthStatus || { idle: [], zombie: [], underutilized: [], overutilized: [] };
    const waste = computeWasteAnalysis(records, hs, hiddenCosts, totalSpend);

    // Service trends
    const serviceTrends = computeServiceTrends(records, dailyMap);

    // Cost allocation
    const allocation = computeAllocation(records, totalSpend, dailyMap);

    // FinOps Score (0-100)
    const hiddenCostRatio = totalSpend > 0 ? totalHiddenCost / totalSpend : 0;
    let finopsScore = 100;

    if (hiddenCostRatio > 0.25) finopsScore -= 25;
    else if (hiddenCostRatio > 0.15) finopsScore -= 15;
    else if (hiddenCostRatio > 0.05) finopsScore -= 5;

    if (budgetUtilization > 120) finopsScore -= 20;
    else if (budgetUtilization > 100) finopsScore -= 15;
    else if (budgetUtilization > 90) finopsScore -= 8;
    else if (budgetUtilization > 75) finopsScore -= 3;

    const missingEnvRecords = records.filter(r => r.environment === 'Unknown').length;
    const missingEnvRatio = missingEnvRecords / records.length;
    if (missingEnvRatio > 0.5) finopsScore -= 15;
    else if (missingEnvRatio > 0.3) finopsScore -= 10;
    else if (missingEnvRatio > 0.1) finopsScore -= 5;

    if (trend.volatility > 50) finopsScore -= 10;
    else if (trend.volatility > 30) finopsScore -= 5;

    if (trend.burnRate > budgetLimit * 1.2) finopsScore -= 10;
    else if (trend.burnRate > budgetLimit) finopsScore -= 5;

    // Waste penalty
    if (waste.wasteRatio > 20) finopsScore -= 15;
    else if (waste.wasteRatio > 10) finopsScore -= 8;
    else if (waste.wasteRatio > 5) finopsScore -= 3;

    finopsScore = Math.max(Math.min(Math.round(finopsScore), 100), 5);
    const optimizationScore = 100;

    return {
      provider,
      totalSpend: Math.round(totalSpend * 100) / 100,
      currentMonthSpend: Math.round(currentMonthSpend * 100) / 100,
      dailySpend: dailyMap,
      weeklySpend: weeklyMap,
      monthlySpend: monthlyMap,
      estimatedEomCost: Math.round(estimatedEomCost * 100) / 100,
      budgetLimit,
      budgetUtilization: Math.round(budgetUtilization * 100) / 100,
      finopsScore,
      optimizationScore,
      trend,
      periodComparison,
      efficiency,
      waste,
      serviceTrends,
      allocation,
      breakdown: {
        service: serviceMap, region: regionMap, account: accountMap,
        environment: environmentMap, team: teamMap, application: applicationMap, tag: tagMap
      },
      hiddenCosts
    };
  }
}

import type { ResourceDetail } from './types';
