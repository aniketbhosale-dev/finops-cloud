export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface BillingRecord {
  id: string;
  provider: CloudProvider;
  date: string; // YYYY-MM-DD
  service: string;
  cost: number; // in USD
  region: string;
  account: string; // AWS Account ID, Azure Subscription ID, GCP Project ID
  resourceId: string;
  resourceGroup: string; // Azure resource group, GCP project, or AWS resource tag
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
  percentageSpike: number; // e.g., 150 (for +150% increase)
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface Recommendation {
  id: string;
  category: 'Compute' | 'Storage' | 'Networking' | 'Database' | 'Kubernetes' | 'Serverless' | 'Security';
  title: string;
  description: string;
  resourceId: string;
  provider: CloudProvider;
  impact: 'low' | 'medium' | 'high';
  potentialSavings: number; // monthly savings in USD
  effort: 'easy' | 'moderate' | 'hard';
  actionableSteps: string[];
}

export interface ResourceDetail {
  id: string;
  name: string;
  type: string; // e.g. "Virtual Machine", "Storage Volume", "Static IP", "NAT Gateway"
  provider: CloudProvider;
  cost: number; // monthly cost of resource
  metric: string; // explanation of metric triggering this status
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
  confidence: number; // 0 to 100
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
  finopsScore: number; // 0 - 100
  optimizationScore: number; // 0 - 100
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
