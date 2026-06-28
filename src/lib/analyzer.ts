import type { BillingRecord, AnalysisResults, CloudProvider, HiddenCostDetail } from './types';

// Helper to get week of year or week start date
function getWeekStartDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Helper to get month string (YYYY-MM)
function getMonthString(dateStr: string): string {
  return dateStr.substring(0, 7);
}

// Heuristic scanning for hidden costs
export function scanHiddenCosts(records: BillingRecord[]): HiddenCostDetail[] {
  const hiddenCosts: HiddenCostDetail[] = [];
  let idCounter = 1;

  records.forEach(r => {
    let isHidden = false;
    let category = '';
    let details = '';

    if (r.provider === 'aws') {
      const serviceLower = r.service.toLowerCase();
      const usageLower = r.resourceGroup.toLowerCase(); // resourceGroup stores usageType for AWS

      if (usageLower.includes('natgateway') || serviceLower.includes('natgateway') || serviceLower === 'amazonvpc') {
        isHidden = true;
        category = 'NAT Gateway';
        details = 'Hourly charge for active NAT Gateway endpoints and data processing rates.';
      } else if (usageLower.includes('elasticip:idle') || usageLower.includes('idleaddress') || serviceLower === 'elasticip') {
        isHidden = true;
        category = 'Elastic IP';
        details = 'Charges incurred for public IP addresses allocated but not attached to running instances.';
      } else if (usageLower.includes('publicipv4') || usageLower.includes('ipv4') || serviceLower.includes('publicipv4')) {
        isHidden = true;
        category = 'Public IPv4 Charges';
        details = 'Standard AWS charge ($0.005/hour) for all public IPv4 addresses.';
      } else if (usageLower.includes('regional-bytes') || usageLower.includes('datatransfer-regional') || usageLower.includes('intrazone')) {
        isHidden = true;
        category = 'Cross-AZ Traffic';
        details = 'Data transfer fees between separate AWS Availability Zones in the same region.';
      } else if (usageLower.includes('interregion') || serviceLower === 'awssdatatransfer') {
        isHidden = true;
        category = 'Inter-Region Data Transfer';
        details = 'Data transfer charges for transmitting data between different AWS geographical regions.';
      } else if (serviceLower.includes('cloudwatch') || serviceLower === 'amazoncloudwatch') {
        isHidden = true;
        category = 'CloudWatch Logs';
        details = 'Charges for log ingestion, storage, and retention periods.';
      } else if (serviceLower.includes('cloudtrail') || serviceLower === 'awscloudtrail') {
        isHidden = true;
        category = 'CloudTrail';
        details = 'Charges for management and data events audit trails.';
      } else if (usageLower.includes('snapshot') || (serviceLower === 'amazonec2' && usageLower.includes('ebs:snapshot'))) {
        isHidden = true;
        category = 'Snapshots';
        details = 'Backup storage costs for EBS volume snapshots.';
      } else if (usageLower.includes('ebs:volume') || (serviceLower === 'amazonec2' && usageLower.includes('ebs:volume'))) {
        isHidden = true;
        category = 'EBS Volumes';
        details = 'Cost for provisioned EBS block storage volumes.';
      } else if (serviceLower === 'awselb' || serviceLower === 'elasticloadbalancing' || usageLower.includes('loadbalancing')) {
        isHidden = true;
        category = 'Idle Load Balancers';
        details = 'Charges for Application or Network Load Balancers running with low/no requests.';
      } else if (serviceLower.includes('apigateway')) {
        isHidden = true;
        category = 'API Gateway Requests';
        details = 'API Gateway execution costs based on request volumes.';
      } else if (serviceLower === 'awskms' || serviceLower === 'kms') {
        isHidden = true;
        category = 'KMS Requests';
        details = 'Costs incurred from Key Management Service requests and active keys.';
      } else if (serviceLower.includes('secretsmanager')) {
        isHidden = true;
        category = 'Secrets Manager';
        details = 'Charges for hosting active secrets and request counts.';
      } else if (serviceLower.includes('route53')) {
        isHidden = true;
        category = 'Route53 Hosted Zones';
        details = 'Monthly charge for hosted DNS zones and queries.';
      } else if (serviceLower === 'amazons3' && usageLower.includes('requests')) {
        isHidden = true;
        category = 'S3 Request Charges';
        details = 'Charges for S3 API operations (PUT, GET, LIST).';
      }
    } else if (r.provider === 'azure') {
      const serviceLower = r.service.toLowerCase();

      if (serviceLower.includes('public ip')) {
        isHidden = true;
        category = 'Public IP';
        details = 'Charges for idle or active public IP addresses.';
      } else if (serviceLower.includes('managed disks') || serviceLower.includes('disk')) {
        isHidden = true;
        category = 'Managed Disks';
        details = 'Provisioned Azure disk storage capacity cost.';
      } else if (serviceLower.includes('log analytics') || serviceLower.includes('monitor')) {
        isHidden = true;
        category = 'Log Analytics';
        details = 'Data ingestion costs and log workspace retention.';
      } else if (serviceLower.includes('backup') || serviceLower.includes('recovery services')) {
        isHidden = true;
        category = 'Backup Vault';
        details = 'Azure recovery vaults storage charges for virtual machines and databases.';
      } else if (serviceLower.includes('firewall')) {
        isHidden = true;
        category = 'Azure Firewall';
        details = 'Azure Firewall deployment hours and data processing charges.';
      } else if (serviceLower.includes('vpn gateway') || serviceLower.includes('network gateway')) {
        isHidden = true;
        category = 'VPN Gateway';
        details = 'Charges for provisioning Virtual Network VPN connections.';
      } else if (serviceLower.includes('data transfer') || serviceLower.includes('bandwidth')) {
        isHidden = true;
        category = 'Data Transfer';
        details = 'Charges for network egress traffic out of Azure datacenters.';
      }
    } else if (r.provider === 'gcp') {
      const serviceLower = r.service.toLowerCase();
      const resourceLower = r.resourceId.toLowerCase();

      if (serviceLower.includes('cloud nat') || serviceLower.includes('nat')) {
        isHidden = true;
        category = 'Cloud NAT';
        details = 'Hourly NAT gateways charges and traffic throughput processing rates.';
      } else if (resourceLower.includes('static-ip') || resourceLower.includes('static_ip') || (serviceLower.includes('compute') && resourceLower.includes('ip'))) {
        isHidden = true;
        category = 'Static IP';
        details = 'Google Cloud charges for unused external IP addresses.';
      } else if (serviceLower.includes('logging') || serviceLower.includes('stackdriver')) {
        isHidden = true;
        category = 'Logging';
        details = 'Ingestion and storage costs for GCP Cloud Logging logs.';
      } else if (serviceLower.includes('storage') && (resourceLower.includes('ops') || resourceLower.includes('operations'))) {
        isHidden = true;
        category = 'Cloud Storage Operations';
        details = 'Class A and Class B API operation request fees for Cloud Storage.';
      } else if (serviceLower.includes('compute') && (resourceLower.includes('traffic') || resourceLower.includes('network') || resourceLower.includes('egress'))) {
        isHidden = true;
        category = 'Inter-zone Traffic';
        details = 'Data transfer costs between VM instances located in different GCP zones.';
      } else if (resourceLower.includes('snapshot') || (serviceLower.includes('storage') && resourceLower.includes('snap'))) {
        isHidden = true;
        category = 'Snapshot Storage';
        details = 'Backup storage costs for VM persistent disk snapshots.';
      }
    }

    if (isHidden) {
      hiddenCosts.push({
        id: `hc-${r.provider}-${idCounter++}`,
        category,
        service: r.service,
        cost: r.cost,
        details,
        provider: r.provider
      });
    }
  });

  return hiddenCosts;
}

export class CostAnalyzer {
  static analyze(records: BillingRecord[]): Omit<AnalysisResults, 'anomalies' | 'recommendations' | 'resourceHealth' | 'forecasts'> {
    if (records.length === 0) {
      throw new Error('Cannot analyze empty record list');
    }

    const provider = records[0].provider;
    let totalSpend = 0;
    
    // Breakdowns
    const serviceMap: Record<string, number> = {};
    const regionMap: Record<string, number> = {};
    const accountMap: Record<string, number> = {};
    const environmentMap: Record<string, number> = {};
    const teamMap: Record<string, number> = {};
    const applicationMap: Record<string, number> = {};
    const tagMap: Record<string, Record<string, number>> = {};

    // Trend analysis
    const dailyMap: Record<string, number> = {};
    const weeklyMap: Record<string, number> = {};
    const monthlyMap: Record<string, number> = {};

    // Date calculations to find the current month spend
    let latestDateStr = '1970-01-01';
    records.forEach(r => {
      if (r.date > latestDateStr) {
        latestDateStr = r.date;
      }
    });

    const latestMonth = getMonthString(latestDateStr);
    let currentMonthSpend = 0;

    records.forEach(r => {
      const cost = r.cost;
      totalSpend += cost;

      if (getMonthString(r.date) === latestMonth) {
        currentMonthSpend += cost;
      }

      // Group breakdowns
      serviceMap[r.service] = (serviceMap[r.service] || 0) + cost;
      regionMap[r.region] = (regionMap[r.region] || 0) + cost;
      accountMap[r.account] = (accountMap[r.account] || 0) + cost;
      environmentMap[r.environment] = (environmentMap[r.environment] || 0) + cost;
      teamMap[r.team] = (teamMap[r.team] || 0) + cost;
      applicationMap[r.application] = (applicationMap[r.application] || 0) + cost;

      // Tag breakdown
      Object.entries(r.tags).forEach(([k, v]) => {
        if (!tagMap[k]) tagMap[k] = {};
        tagMap[k][v] = (tagMap[k][v] || 0) + cost;
      });

      // Trend breakdowns
      dailyMap[r.date] = (dailyMap[r.date] || 0) + cost;
      
      const week = getWeekStartDate(r.date);
      weeklyMap[week] = (weeklyMap[week] || 0) + cost;
      
      const month = getMonthString(r.date);
      monthlyMap[month] = (monthlyMap[month] || 0) + cost;
    });

    // Estimate End of Month Cost
    // Look at how many days in the month have records, and project
    const latestDate = new Date(latestDateStr);
    const dayOfLatest = latestDate.getDate();
    const yearOfLatest = latestDate.getFullYear();
    const monthOfLatest = latestDate.getMonth();
    const totalDaysInMonth = new Date(yearOfLatest, monthOfLatest + 1, 0).getDate();
    
    // Find unique days recorded in latest month
    const daysInLatestMonth = Object.keys(dailyMap).filter(d => d.startsWith(latestMonth)).length;
    const daysDivider = daysInLatestMonth > 0 ? daysInLatestMonth : Math.min(dayOfLatest, 28);
    const estimatedEomCost = (currentMonthSpend / daysDivider) * totalDaysInMonth;

    // Define defaults budget limits per cloud provider
    const budgetLimits: Record<CloudProvider, number> = {
      aws: 10000,
      azure: 8000,
      gcp: 6000
    };
    const budgetLimit = budgetLimits[provider] || 5000;
    const budgetUtilization = (currentMonthSpend / budgetLimit) * 100;

    // Perform hidden cost scan
    const hiddenCosts = scanHiddenCosts(records);
    const totalHiddenCost = hiddenCosts.reduce((sum, h) => sum + h.cost, 0);

    // Calculate FinOps and Optimization Score
    // FinOps Score starts at 100. Let's penalize for:
    // 1. High hidden costs ratio (> 15% of total spend)
    // 2. High budget utilization (> 90%)
    // 3. Lack of tags on resources
    const hiddenCostRatio = totalSpend > 0 ? totalHiddenCost / totalSpend : 0;
    let finopsScore = 100;
    if (hiddenCostRatio > 0.25) finopsScore -= 20;
    else if (hiddenCostRatio > 0.15) finopsScore -= 10;
    else if (hiddenCostRatio > 0.05) finopsScore -= 5;

    if (budgetUtilization > 100) finopsScore -= 15;
    else if (budgetUtilization > 90) finopsScore -= 8;

    // Check environment tagging coverage
    const missingEnvRecords = records.filter(r => r.environment === 'Unknown').length;
    const missingEnvRatio = missingEnvRecords / records.length;
    if (missingEnvRatio > 0.3) finopsScore -= 15;
    else if (missingEnvRatio > 0.1) finopsScore -= 7;

    finopsScore = Math.max(Math.min(Math.round(finopsScore), 100), 10);

    // Base optimization score: starts at 100, gets lower if there's significant waste.
    // (Actual calculation completed when recommendation engine adds potentialSavings)
    const optimizationScore = 100; // placeholder to be populated fully in recommendations aggregator

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
      breakdown: {
        service: serviceMap,
        region: regionMap,
        account: accountMap,
        environment: environmentMap,
        team: teamMap,
        application: applicationMap,
        tag: tagMap
      },
      hiddenCosts
    };
  }
}
