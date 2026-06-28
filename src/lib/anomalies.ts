import type { BillingRecord, Anomaly, ResourceDetail, ResourceHealthStatus } from './types';

export class AnomalyDetector {
  static detect(records: BillingRecord[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    let idCounter = 1;

    // Group costs by Date + Service
    const serviceDailyCost: Record<string, Record<string, number>> = {};
    const serviceList = new Set<string>();

    records.forEach(r => {
      serviceList.add(r.service);
      if (!serviceDailyCost[r.service]) {
        serviceDailyCost[r.service] = {};
      }
      serviceDailyCost[r.service][r.date] = (serviceDailyCost[r.service][r.date] || 0) + r.cost;
    });

    // Detect spikes for each service
    serviceList.forEach(service => {
      const dailyCosts = serviceDailyCost[service];
      const dates = Object.keys(dailyCosts).sort();

      if (dates.length < 3) return; // Need a few days to compute historical average

      for (let i = 2; i < dates.length; i++) {
        const currentDate = dates[i];
        const currentCost = dailyCosts[currentDate];

        // Compute weighted moving average (recent days weighted more)
        const lookbackDays = Math.min(i, 7);
        const previousDays = dates.slice(i - lookbackDays, i);
        let weightedSum = 0;
        let weightTotal = 0;
        for (let j = 0; j < previousDays.length; j++) {
          const weight = j + 1; // more recent = higher weight
          weightedSum += dailyCosts[previousDays[j]] * weight;
          weightTotal += weight;
        }
        const weightedAverage = weightTotal > 0 ? weightedSum / weightTotal : 0;

        // Simple average for comparison
        const simpleSum = previousDays.reduce((acc, d) => acc + dailyCosts[d], 0);
        const simpleAverage = simpleSum / previousDays.length;

        // Use weighted average as baseline
        const average = weightedAverage;

        // Dynamic thresholds based on service cost magnitude
        const absoluteThreshold = Math.max(20, average * 0.3); // at least $20 or 30% of avg
        const spikeThreshold = 2.0; // 200% of average (2x)

        if (average > 0.5 && currentCost > average * spikeThreshold && (currentCost - average) > absoluteThreshold) {
          const spikePercent = Math.round(((currentCost - average) / average) * 100);
          const costImpact = currentCost - average;

          // Compute weighted anomaly score (0-100)
          // Factors: spike magnitude (40%), cost impact (35%), frequency in data (25%)
          const magnitudeScore = Math.min(40, (spikePercent / 10)); // 400% spike = max 40pts
          const impactScore = Math.min(35, (costImpact / 50)); // $50+ impact = max 35pts
          const frequencyInData = dates.filter(d => {
            const c = dailyCosts[d];
            return c > average * spikeThreshold;
          }).length;
          const frequencyScore = Math.min(25, frequencyInData * 8); // each occurrence = 8pts
          const anomalyScore = Math.round(magnitudeScore + impactScore + frequencyScore);

          // Determine severity based on weighted score
          let severity: 'low' | 'medium' | 'high' = 'medium';
          if (anomalyScore >= 60 || (costImpact > 200 && spikePercent > 400)) {
            severity = 'high';
          } else if (anomalyScore < 30 || costImpact < 50) {
            severity = 'low';
          }

          // Find a sample region and resource ID from the records for this service/date to details
          const sampleRecord = records.find(r => r.service === service && r.date === currentDate);
          const region = sampleRecord?.region || 'Global';

          anomalies.push({
            id: `anom-${idCounter++}`,
            date: currentDate,
            service,
            region,
            cost: Math.round(currentCost * 100) / 100,
            previousAverage: Math.round(average * 100) / 100,
            percentageSpike: spikePercent,
            severity,
            anomalyScore,
            dailyImpact: Math.round(costImpact * 100) / 100,
            description: `Spending spike on ${service} in ${region}: $${currentCost.toFixed(2)} vs avg $${average.toFixed(2)} (+${spikePercent}%). Impact: $${costImpact.toFixed(2)} over baseline.`
          });
        }
      }
    });

    // Sort anomalies: highest score first, then latest date
    return anomalies.sort((a, b) => {
      if (b.anomalyScore !== a.anomalyScore) return b.anomalyScore - a.anomalyScore;
      return b.date.localeCompare(a.date);
    });
  }

  static analyzeResourceHealth(records: BillingRecord[]): ResourceHealthStatus {
    const idle: ResourceDetail[] = [];
    const zombie: ResourceDetail[] = [];
    const underutilized: ResourceDetail[] = [];
    const overutilized: ResourceDetail[] = [];

    // Track unique resources by resourceId to avoid duplicate health issues
    const seenResources = new Set<string>();

    records.forEach(r => {
      if (!r.resourceId || seenResources.has(r.resourceId)) return;

      const serviceLower = r.service.toLowerCase();
      const usageLower = r.resourceGroup.toLowerCase();
      const resourceIdLower = r.resourceId.toLowerCase();

      // Heuristics based on naming/categories in our mock data generator:

      // 1. Zombie resources (unattached, idle, or orphaned static IPs/disks/volumes)
      if (usageLower.includes('elasticip:idle') || serviceLower === 'elasticip') {
        seenResources.add(r.resourceId);
        zombie.push({
          id: r.resourceId,
          name: 'Idle Elastic IP',
          type: 'Static IP',
          provider: r.provider,
          cost: 108.0, // monthly cost ≈ $0.005/hr * 24 * 30 * 30
          metric: 'Associated EC2 instance was terminated or IP is unassociated.',
          status: 'zombie'
        });
      } else if (usageLower.includes('ebs:volume') && resourceIdLower.includes('vol-0a1b')) {
        seenResources.add(r.resourceId);
        zombie.push({
          id: r.resourceId,
          name: 'Unattached EBS Volume',
          type: 'Storage Volume',
          provider: r.provider,
          cost: 135.0, // monthly cost
          metric: 'Volume has been detached from instances for > 14 days.',
          status: 'zombie'
        });
      } else if (serviceLower.includes('managed disks') && resourceIdLower.includes('unattached')) {
        seenResources.add(r.resourceId);
        zombie.push({
          id: r.resourceId,
          name: 'Orphan Azure Managed Disk',
          type: 'Storage Volume',
          provider: r.provider,
          cost: 156.0,
          metric: 'Disk state is unattached with 0 IOPS read/write.',
          status: 'zombie'
        });
      } else if (serviceLower.includes('public ip addresses') && resourceIdLower.includes('unused')) {
        seenResources.add(r.resourceId);
        zombie.push({
          id: r.resourceId,
          name: 'Unused Public IP',
          type: 'Static IP',
          provider: r.provider,
          cost: 54.0,
          metric: 'IP address is not mapped to any Virtual Network adapter.',
          status: 'zombie'
        });
      } else if (serviceLower.includes('compute engine') && resourceIdLower.includes('static-ip-unused')) {
        seenResources.add(r.resourceId);
        zombie.push({
          id: r.resourceId,
          name: 'Unused GCP Static External IP',
          type: 'Static IP',
          provider: r.provider,
          cost: 66.0,
          metric: 'External IP address is in reserved state with no attached VM instance.',
          status: 'zombie'
        });
      }

      // 2. Idle resources
      else if (serviceLower === 'awselb' && resourceIdLower.includes('dev-internal')) {
        seenResources.add(r.resourceId);
        idle.push({
          id: r.resourceId,
          name: 'Idle Classic/Application Load Balancer',
          type: 'NAT Gateway',
          provider: r.provider,
          cost: 360.0,
          metric: 'Average active connections < 1 over last 30 days.',
          status: 'idle'
        });
      } else if (serviceLower === 'vpn gateway' && resourceIdLower.includes('dev-gateway')) {
        seenResources.add(r.resourceId);
        idle.push({
          id: r.resourceId,
          name: 'Idle VPN Gateway',
          type: 'NAT Gateway',
          provider: r.provider,
          cost: 345.0,
          metric: 'Gateway connection status is offline with zero tunnel traffic.',
          status: 'idle'
        });
      } else if (serviceLower === 'amazonrds' && resourceIdLower.includes('replica-dev')) {
        seenResources.add(r.resourceId);
        idle.push({
          id: r.resourceId,
          name: 'Idle RDS Read-Replica',
          type: 'Database',
          provider: r.provider,
          cost: 540.0,
          metric: 'Database connections = 0, CPU utilization < 1%.',
          status: 'idle'
        });
      }

      // 3. Underutilized (Candidate for resizing)
      else if (serviceLower === 'amazonec2' && resourceIdLower.includes('dev987654321')) {
        seenResources.add(r.resourceId);
        underutilized.push({
          id: r.resourceId,
          name: 'Oversized EC2 Instance',
          type: 'Virtual Machine',
          provider: r.provider,
          cost: 720.0,
          metric: 'Max CPU utilization = 4.2%, Average CPU = 1.1%.',
          status: 'underutilized'
        });
      } else if (serviceLower === 'virtual machines' && resourceIdLower.includes('vm-dev-')) {
        seenResources.add(r.resourceId);
        underutilized.push({
          id: r.resourceId,
          name: 'Oversized Azure VM (DS-series)',
          type: 'Virtual Machine',
          provider: r.provider,
          cost: 900.0,
          metric: 'Maximum CPU = 3.5%, RAM usage < 15%.',
          status: 'underutilized'
        });
      } else if (serviceLower === 'compute engine' && resourceIdLower.includes('instance-dev-')) {
        seenResources.add(r.resourceId);
        underutilized.push({
          id: r.resourceId,
          name: 'Oversized GCP Compute Engine (e2-standard)',
          type: 'Virtual Machine',
          provider: r.provider,
          cost: 660.0,
          metric: 'CPU usage consistently < 2.5% during office hours.',
          status: 'underutilized'
        });
      }

      // 4. Overutilized (Simulated high-priority active instances)
      else if (serviceLower === 'amazonec2' && resourceIdLower.includes('prod-') && r.cost > 100) {
        seenResources.add(r.resourceId);
        overutilized.push({
          id: r.resourceId,
          name: 'High Performance EC2 Instance',
          type: 'Virtual Machine',
          provider: r.provider,
          cost: r.cost * 30,
          metric: 'CPU utilization consistently > 90%. Recommend scaling up or out.',
          status: 'overutilized'
        });
      }
    });

    return { idle, zombie, underutilized, overutilized };
  }
}
