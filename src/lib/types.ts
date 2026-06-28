export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface BillingRecord {
  id: string;
  provider: CloudProvider;
  date: string; // YYYY-MM-DD
  service: string;
  cost: number; // in USD
  region: string;
  account: string;
  resourceId: string;
  resourceGroup: string;
  environment: 'Production' | 'Development' | 'Staging' | 'Test' | 'Unknown';
  team: string;
  application: string;
  tags: Record<string, string>;
}

export interface Anomaly {
  id: string;
  date: string;
  service: string;
  region: string;
  cost: number;
  previousAverage: number;
  percentageSpike: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  anomalyScore: number;
  dailyImpact: number; // dollar impact per day of anomaly
}

export interface Recommendation {
  id: string;
  category: 'Compute' | 'Storage' | 'Networking' | 'Database' | 'Kubernetes' | 'Serverless' | 'Security';
  title: string;
  description: string;
  resourceId: string;
  provider: CloudProvider;
  impact: 'low' | 'medium' | 'high';
  potentialSavings: number;
  effort: 'easy' | 'moderate' | 'hard';
  actionableSteps: string[];
  roiMonths: number;
  annualSavings: number;
  priority: number; // 1-10, higher = more urgent
}

export interface ResourceDetail {
  id: string;
  name: string;
  type: string;
  provider: CloudProvider;
  cost: number;
  metric: string;
  status: 'idle' | 'zombie' | 'underutilized' | 'overutilized';
}

export interface ResourceHealthStatus {
  idle: ResourceDetail[];
  zombie: ResourceDetail[];
  underutilized: ResourceDetail[];
  overutilized: ResourceDetail[];
}

export interface Forecast {
  period: 'EOM' | 'EOQ' | 'Yearly';
  predictedCost: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface HiddenCostDetail {
  id: string;
  category: string;
  service: string;
  cost: number;
  details: string;
  provider: CloudProvider;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  dailyChangeRate: number;
  weeklyChangeRate: number;
  volatility: number;
  burnRate: number;
  peakDay: string;
  peakCost: number;
  lowestDay: string;
  lowestCost: number;
  momentum: number; // -1 to 1, negative = decelerating, positive = accelerating
}

export interface PeriodComparison {
  currentPeriod: { label: string; spend: number; days: number };
  previousPeriod: { label: string; spend: number; days: number };
  changeAbsolute: number;
  changePercentage: number;
  direction: 'up' | 'down' | 'flat';
  dailyAvgCurrent: number;
  dailyAvgPrevious: number;
  normalizedComparison: number; // previous period scaled to same number of days for fair comparison
}

export interface CostEfficiency {
  costPerDay: number;
  costPerService: number;
  costPerRegion: number;
  topServiceConcentration: number; // % of total spend from top 3 services
  paretoprinciple: number; // % of services accounting for 80% of spend
  giniCoefficient: number; // 0-1, measures spend distribution inequality
}

export interface WasteAnalysis {
  totalWaste: number;
  wasteRatio: number; // waste as % of total spend
  zombieCost: number;
  idleCost: number;
  underutilizedCost: number;
  overprovisionedCost: number; // estimated from underutilized resources
  recoverableSavings: number; // immediate savings from eliminating waste
  wasteByCategory: Record<string, number>;
  wasteByProvider: Record<string, number>;
}

export interface ServiceTrend {
  service: string;
  currentCost: number;
  previousCost: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
  dailyAvg: number;
  trendSlope: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CostAllocation {
  byService: AllocationEntry[];
  byRegion: AllocationEntry[];
  byEnvironment: AllocationEntry[];
  byTeam: AllocationEntry[];
  byApplication: AllocationEntry[];
}

export interface AllocationEntry {
  name: string;
  cost: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  dailyAvg: number;
}

export interface ExecutiveInsight {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  category: 'spend' | 'anomaly' | 'waste' | 'efficiency' | 'forecast' | 'recommendation';
  title: string;
  message: string;
  metric?: string;
  impact?: string;
}

export interface AnalysisResults {
  provider: CloudProvider;
  totalSpend: number;
  currentMonthSpend: number;
  dailySpend: Record<string, number>;
  weeklySpend: Record<string, number>;
  monthlySpend: Record<string, number>;
  estimatedEomCost: number;
  budgetLimit: number;
  budgetUtilization: number;
  finopsScore: number;
  optimizationScore: number;
  trend: TrendAnalysis;
  periodComparison: PeriodComparison;
  efficiency: CostEfficiency;
  waste: WasteAnalysis;
  serviceTrends: ServiceTrend[];
  allocation: CostAllocation;
  insights: ExecutiveInsight[];
  breakdown: {
    service: Record<string, number>;
    region: Record<string, number>;
    account: Record<string, number>;
    environment: Record<string, number>;
    team: Record<string, number>;
    application: Record<string, number>;
    tag: Record<string, Record<string, number>>;
  };
  hiddenCosts: HiddenCostDetail[];
  anomalies: Anomaly[];
  recommendations: Recommendation[];
  resourceHealth: ResourceHealthStatus;
  forecasts: Forecast[];
}
