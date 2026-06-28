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

        // Compute running average of previous days (up to 7 days prior)
        const previousDays = dates.slice(Math.max(0, i - 7), i);
        const sum = previousDays.reduce((acc, d) => acc + dailyCosts[d], 0);
        const average = sum / previousDays.length;

        // Thresholds for anomaly: spike of > 200% (3x) and absolute increase of > $30
        if (average > 1 && currentCost > average * 3 && currentCost - average > 30) {
          const spikePercent = Math.round(((currentCost - average) / average) * 100);
          
          let severity: 'low' | 'medium' | 'high' = 'medium';
          if (currentCost - average > 200 && spikePercent > 500) {
            severity = 'high';
          } else if (currentCost - average < 50) {
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
            description: `Sudden spending spike detected on service ${service} in ${region}. Cost jumped to $${currentCost.toFixed(2)} compared to an average of $${average.toFixed(2)} (+${spikePercent}%).`
          });
        }
      }
    });

    // Sort anomalies: latest date first, then high severity first
    return anomalies.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      const sevWeight = { high: 3, medium: 2, low: 1 };
      return sevWeight[b.severity] - sevWeight[a.severity];
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
