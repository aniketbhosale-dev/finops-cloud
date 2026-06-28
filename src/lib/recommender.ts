import type { BillingRecord, Recommendation, ResourceHealthStatus, CloudProvider } from './types';

export class RecommendationEngine {
  static generate(records: BillingRecord[], healthStatus: ResourceHealthStatus): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const provider = records[0]?.provider || 'aws';
    let idCounter = 1;

    // Helper to compute priority: higher = more urgent
    const calcPriority = (impact: string, effort: string, savings: number): number => {
      let p = 5;
      if (impact === 'high') p += 3; else if (impact === 'medium') p += 1;
      if (effort === 'easy') p += 2; else if (effort === 'hard') p -= 1;
      if (savings > 300) p += 1; else if (savings < 50) p -= 1;
      return Math.max(1, Math.min(10, p));
    };

    // 1. Compute Recommendations (Mapped from underutilized VM instances)
    const allUnderutilized = [...healthStatus.underutilized];
    allUnderutilized.forEach(res => {
      const savings = Math.round(res.cost * 0.5);
      recommendations.push({
        id: `rec-comp-${idCounter++}`,
        category: 'Compute',
        title: `Right-size ${res.name}: Reduce Over-Provisioning`,
        description: `Resource '${res.id}' (${res.name}) has average CPU utilization under 5%. Downsizing to a smaller instance type will maintain performance while cutting costs by ~50%.`,
        resourceId: res.id,
        provider: res.provider,
        impact: 'high',
        potentialSavings: savings,
        effort: 'moderate',
        actionableSteps: [
          `Review peak CPU/memory utilization for ${res.id} over the past 30 days.`,
          `Identify the smallest instance type that meets peak demand + 20% buffer.`,
          `Schedule a maintenance window to stop the instance.`,
          `Change instance type and restart. Monitor for 48 hours before decommissioning old config.`
        ],
        roiMonths: 1,
        annualSavings: savings * 12,
        priority: calcPriority('high', 'moderate', savings)
      });
    });

    // If no active underutilized instances found, add a generic compute recommendation
    if (allUnderutilized.length === 0) {
      recommendations.push({
        id: `rec-comp-${idCounter++}`,
        category: 'Compute',
        title: 'Establish Reserved Instances / Savings Plans',
        description: 'Compute usage shows a stable baseline. Purchasing 1-year or 3-year commitments can save up to 72% vs On-Demand pricing for steady-state workloads.',
        resourceId: 'Global-Compute',
        provider,
        impact: 'high',
        potentialSavings: 350.0,
        effort: 'easy',
        actionableSteps: [
          'Review Cost Explorer reservation purchase recommendations.',
          'Analyze 30-day compute usage to identify steady-state instances eligible for commitments.',
          'Select a 1-Year No Upfront Savings Plan for flexible compute workloads.',
          'Approve purchase in billing dashboard and set up utilization tracking.'
        ],
        roiMonths: 1,
        annualSavings: 4200.0,
        priority: calcPriority('high', 'easy', 350)
      });
    }

    // 2. Storage Recommendations (Mapped from zombie volumes/snapshots)
    const allZombies = [...healthStatus.zombie];
    const disks = allZombies.filter(z => z.type === 'Storage Volume');
    disks.forEach(disk => {
      recommendations.push({
        id: `rec-stor-${idCounter++}`,
        category: 'Storage',
        title: `Delete Unattached Disk Volume: ${disk.name}`,
        description: `Storage volume '${disk.id}' (${disk.name}) is detached from all instances but still incurring charges. Deleting it eliminates waste immediately.`,
        resourceId: disk.id,
        provider: disk.provider,
        impact: 'medium',
        potentialSavings: disk.cost,
        effort: 'easy',
        actionableSteps: [
          `Verify no application depends on volume ${disk.id}.`,
          `Create a final backup snapshot if data retention is required.`,
          `Delete the unattached volume from the storage console.`,
          `Add automation rules to flag volumes unattached for > 7 days.`
        ],
        roiMonths: 0,
        annualSavings: disk.cost * 12,
        priority: calcPriority('medium', 'easy', disk.cost)
      });
    });

    // Old snapshots check (AWS specific in mock data)
    const hasSnapshots = records.some(r => r.service === 'AmazonEC2' && r.resourceGroup.includes('EBS:Snapshot'));
    if (hasSnapshots) {
      recommendations.push({
        id: `rec-stor-${idCounter++}`,
        category: 'Storage',
        title: 'Clean Up Stale EBS Snapshots',
        description: 'Snapshots older than 90 days detected. Deleting stale backups reduces S3/EBS snapshot storage costs without impacting recovery capability.',
        resourceId: 'ebs-snapshots-stale',
        provider: 'aws',
        impact: 'medium',
        potentialSavings: 180.0,
        effort: 'easy',
        actionableSteps: [
          'List all EBS snapshots and sort by creation date.',
          'Identify snapshots not linked to any existing AMI or volume.',
          'Delete snapshots exceeding 30-day retention policy.',
          'Implement AWS Backup lifecycle policies to automate future snapshot expiration.'
        ],
        roiMonths: 0,
        annualSavings: 2160.0,
        priority: calcPriority('medium', 'easy', 180)
      });
    }

    // 3. Networking Recommendations
    const publicIps = allZombies.filter(z => z.type === 'Static IP');
    publicIps.forEach(ip => {
      recommendations.push({
        id: `rec-net-${idCounter++}`,
        category: 'Networking',
        title: `Release Unused Public IP: ${ip.name}`,
        description: `IP address '${ip.id}' (${ip.name}) is allocated but unassociated, incurring hourly idle charges. Releasing it returns it to the public pool at no cost.`,
        resourceId: ip.id,
        provider: ip.provider,
        impact: 'low',
        potentialSavings: ip.cost,
        effort: 'easy',
        actionableSteps: [
          `Verify IP ${ip.id} is not used for DNS or static service endpoints.`,
          `Select the IP address in the networking console.`,
          `Disassociate and release the Elastic/Static IP address.`,
          `Update DNS records if they pointed to this IP.`
        ],
        roiMonths: 0,
        annualSavings: ip.cost * 12,
        priority: calcPriority('low', 'easy', ip.cost)
      });
    });

    // NAT Gateway optimization recommendation
    const hasNatGateways = records.some(r => r.service.toLowerCase().includes('nat') || r.resourceGroup.toLowerCase().includes('natgateway'));
    if (hasNatGateways) {
      recommendations.push({
        id: `rec-net-${idCounter++}`,
        category: 'Networking',
        title: 'Optimize NAT Gateway Spend with VPC Endpoints',
        description: 'High traffic volumes through NAT Gateways detected. Establishing VPC Gateway Endpoints for S3 and DynamoDB routes traffic internally, eliminating data processing charges.',
        resourceId: 'nat-gateways-route',
        provider,
        impact: 'high',
        potentialSavings: 450.0,
        effort: 'moderate',
        actionableSteps: [
          'Identify S3/DynamoDB traffic flows from private subnets via VPC Flow Logs.',
          'Create VPC Gateway Endpoints for S3 and DynamoDB.',
          'Update route tables to prioritize gateway endpoints over NAT.',
          'Monitor NAT Gateway data processing charges for 7 days post-change.'
        ],
        roiMonths: 1,
        annualSavings: 5400.0,
        priority: calcPriority('high', 'moderate', 450)
      });
    }

    // 4. Database Recommendations (Idle replica)
    const idleDbs = healthStatus.idle.filter(i => i.type === 'Database');
    idleDbs.forEach(db => {
      recommendations.push({
        id: `rec-db-${idCounter++}`,
        category: 'Database',
        title: `Terminate Idle Database: ${db.name}`,
        description: `Database '${db.id}' (${db.name}) has zero connections and < 1% CPU. Taking a snapshot and deleting it eliminates a significant monthly cost.`,
        resourceId: db.id,
        provider: db.provider,
        impact: 'high',
        potentialSavings: db.cost,
        effort: 'moderate',
        actionableSteps: [
          `Verify no batch jobs or scheduled tasks depend on ${db.id}.`,
          `Create a final snapshot for point-in-time recovery.`,
          `Delete the idle database instance.`,
          `Implement auto-stop schedules for dev/test databases outside business hours.`
        ],
        roiMonths: 0,
        annualSavings: db.cost * 12,
        priority: calcPriority('high', 'moderate', db.cost)
      });
    });

    // 5. Kubernetes Recommendations (Generic / Best Practice)
    recommendations.push({
      id: `rec-k8s-${idCounter++}`,
      category: 'Kubernetes',
      title: 'Optimize Container Resource Limits & Enable Autoscaler',
      description: 'Pod resource requests are significantly higher than actual usage. Right-sizing limits allows tighter node packing, reducing the number of VM nodes required.',
      resourceId: 'kubernetes-clusters',
      provider,
      impact: 'medium',
      potentialSavings: 280.0,
      effort: 'moderate',
      actionableSteps: [
        'Deploy Metrics Server and collect 14 days of pod utilization data.',
        'Compare actual vs. requested CPU/Memory across all namespaces.',
        'Set resource requests to P95 utilization + 20% buffer.',
        'Enable Cluster Autoscaler on node pools to scale down underutilized nodes.'
      ],
      roiMonths: 2,
      annualSavings: 3360.0,
      priority: calcPriority('medium', 'moderate', 280)
    });

    // 6. Serverless Recommendations
    const hasLambda = records.some(r => r.service.toLowerCase().includes('lambda') || r.service.toLowerCase().includes('functions'));
    recommendations.push({
      id: `rec-serv-${idCounter++}`,
      category: 'Serverless',
      title: 'Tune Serverless Memory Allocations',
      description: 'Functions running with default 1024MB RAM but only utilizing ~128MB. Reducing memory allocation decreases both GB-Second charges and execution duration.',
      resourceId: 'serverless-functions',
      provider,
      impact: 'low',
      potentialSavings: 45.0,
      effort: 'easy',
      actionableSteps: [
        'Run AWS Lambda Power Tuning tool across memory configurations (128MB-1024MB).',
        'Identify the optimal memory tier that minimizes cost without increasing duration.',
        'Update function configurations in deployment manifests.',
        'Monitor cost and performance for 7 days after changes.'
      ],
      roiMonths: 0,
      annualSavings: 540.0,
      priority: calcPriority('low', 'easy', 45)
    });

    // 7. Security Cost Recommendations
    recommendations.push({
      id: `rec-sec-${idCounter++}`,
      category: 'Security',
      title: 'Clean Up Inactive Secrets & Set Log Retention',
      description: 'Logging vaults set to "Never Expire" and unused KMS keys accumulate storage costs. Applying retention policies and cleaning inactive resources reduces overhead.',
      resourceId: 'security-logging-groups',
      provider,
      impact: 'low',
      potentialSavings: 85.0,
      effort: 'easy',
      actionableSteps: [
        'Audit Secrets Manager for secrets not accessed in 90+ days and schedule deletion.',
        'Set CloudWatch Log Group retention to 30 days for staging/development environments.',
        'Identify and disable KMS keys not associated with any active encrypted resource.',
        'Document the retention policy for ongoing compliance.'
      ],
      roiMonths: 0,
      annualSavings: 1020.0,
      priority: calcPriority('low', 'easy', 85)
    });

    // Sort by priority (highest first)
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations;
  }
}
