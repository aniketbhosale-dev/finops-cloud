import type { BillingRecord, Recommendation, ResourceHealthStatus, CloudProvider } from './types';

export class RecommendationEngine {
  static generate(records: BillingRecord[], healthStatus: ResourceHealthStatus): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const provider = records[0]?.provider || 'aws';
    let idCounter = 1;

    // 1. Compute Recommendations (Mapped from underutilized VM instances)
    const allUnderutilized = [...healthStatus.underutilized];
    allUnderutilized.forEach(res => {
      const savings = Math.round(res.cost * 0.5); // resize saves 50%
      recommendations.push({
        id: `rec-comp-${idCounter++}`,
        category: 'Compute',
        title: `Resize Oversized Virtual Machine: ${res.id}`,
        description: `Resource '${res.id}' (${res.name}) has an average CPU utilization of less than 5%. Resizing to a smaller instance type will maintain performance while saving costs.`,
        resourceId: res.id,
        provider: res.provider,
        impact: 'high',
        potentialSavings: savings,
        effort: 'moderate',
        actionableSteps: [
          `Analyze peak CPU and memory demand for resource ${res.id} over the last 30 days.`,
          `Schedule a maintenance window to stop the instance.`,
          `Modify instance type to a lower spec (e.g. from xlarge to medium/small).`,
          `Start the instance and verify application health.`
        ]
      });
    });

    // If no active underutilized instances found, add a generic compute recommendation
    if (allUnderutilized.length === 0) {
      recommendations.push({
        id: `rec-comp-${idCounter++}`,
        category: 'Compute',
        title: 'Establish Reserved Instances (RI) / Savings Plans',
        description: 'Analysis of compute usage indicates a stable baseline. Purchasing commitments (1-year or 3-year) can save up to 72% compared to On-Demand pricing.',
        resourceId: 'Global-Compute',
        provider,
        impact: 'high',
        potentialSavings: 350.0,
        effort: 'easy',
        actionableSteps: [
          'Review the Cost Explorer reservation purchase recommendations.',
          'Choose a 1-Year No Upfront Savings Plan for flexible compute workloads.',
          'Approve purchase in billing dashboard.'
        ]
      });
    }

    // 2. Storage Recommendations (Mapped from zombie volumes/snapshots)
    const allZombies = [...healthStatus.zombie];
    const disks = allZombies.filter(z => z.type === 'Storage Volume');
    disks.forEach(disk => {
      recommendations.push({
        id: `rec-stor-${idCounter++}`,
        category: 'Storage',
        title: `Delete Unattached Disk Volume: ${disk.id}`,
        description: `Storage volume '${disk.id}' (${disk.name}) is not attached to any running instance. It is incurring charge while doing nothing.`,
        resourceId: disk.id,
        provider: disk.provider,
        impact: 'medium',
        potentialSavings: disk.cost,
        effort: 'easy',
        actionableSteps: [
          `Take a final backup snapshot of volume ${disk.id} if historical data retention is needed.`,
          `Select volume ${disk.id} in the console.`,
          `Execute delete/terminate action.`,
          `Audit automation scripts to ensure volumes are deleted automatically upon instance termination.`
        ]
      });
    });

    // Old snapshots check (AWS specific in mock data)
    const hasSnapshots = records.some(r => r.service === 'AmazonEC2' && r.resourceGroup.includes('EBS:Snapshot'));
    if (hasSnapshots) {
      recommendations.push({
        id: `rec-stor-${idCounter++}`,
        category: 'Storage',
        title: 'Clean Up Stale EBS Snapshots',
        description: 'Detected snapshots older than 90 days. Deleting stale and redundant backups will reduce S3/EBS snapshot storage costs.',
        resourceId: 'ebs-snapshots-stale',
        provider: 'aws',
        impact: 'medium',
        potentialSavings: 180.0,
        effort: 'easy',
        actionableSteps: [
          'List all EBS snapshots and sort by creation date.',
          'Identify snapshots associated with ami/volumes that no longer exist.',
          'Delete snapshots that exceed the standard 30-day retention policy.',
          'Implement AWS Backup lifecycle policies to automate snapshot expiration.'
        ]
      });
    }

    // 3. Networking Recommendations
    const publicIps = allZombies.filter(z => z.type === 'Static IP');
    publicIps.forEach(ip => {
      recommendations.push({
        id: `rec-net-${idCounter++}`,
        category: 'Networking',
        title: `Release Unused Public IP Address: ${ip.id}`,
        description: `Elastic/Public IP address '${ip.id}' is allocated to your account but is not associated with any active server, incurring hourly idle charges.`,
        resourceId: ip.id,
        provider: ip.provider,
        impact: 'low',
        potentialSavings: ip.cost,
        effort: 'easy',
        actionableSteps: [
          `Verify that the IP ${ip.id} is truly idle and not needed for a static DNS config.`,
          `Select the IP address in your cloud console network panel.`,
          `Choose 'Release IP address' / 'Disassociate' to return it to the public pool.`
        ]
      });
    });

    // NAT Gateway optimization recommendation
    const hasNatGateways = records.some(r => r.service.toLowerCase().includes('nat') || r.resourceGroup.toLowerCase().includes('natgateway'));
    if (hasNatGateways) {
      recommendations.push({
        id: `rec-net-${idCounter++}`,
        category: 'Networking',
        title: 'Optimize NAT Gateway Spend with VPC Endpoints',
        description: 'Detected high traffic volumes passing through NAT Gateways. Establishing VPC Gateway Endpoints for S3 and DynamoDB routes traffic through internal networks, eliminating data processing charges.',
        resourceId: 'nat-gateways-route',
        provider,
        impact: 'high',
        potentialSavings: 450.0,
        effort: 'moderate',
        actionableSteps: [
          `Review network flows to identify S3/DynamoDB bucket destinations from private subnets.`,
          `Create a VPC Gateway Endpoint for Amazon S3 in the VPC route tables.`,
          `Verify that traffic to S3 now bypasses the NAT Gateway.`,
          `Decommission unnecessary NAT Gateways in subnets that do not require external internet access.`
        ]
      });
    }

    // 4. Database Recommendations (Idle replica)
    const idleDbs = healthStatus.idle.filter(i => i.type === 'Database');
    idleDbs.forEach(db => {
      recommendations.push({
        id: `rec-db-${idCounter++}`,
        category: 'Database',
        title: `Terminate Idle Database Instance / Replica: ${db.id}`,
        description: `Database instance '${db.id}' (${db.name}) has zero active connections and CPU usage remains under 1%. Consider taking a snapshot and deleting the idle resource.`,
        resourceId: db.id,
        provider: db.provider,
        impact: 'high',
        potentialSavings: db.cost,
        effort: 'moderate',
        actionableSteps: [
          `Confirm with application team that ${db.id} database is not used for periodic batch jobs.`,
          `Take a final database backup snapshot.`,
          `Delete the database replica instance.`,
          `If this is a development instance, implement scripts to stop development databases automatically outside office hours.`
        ]
      });
    });

    // 5. Kubernetes Recommendations (Generic / Best Practice)
    recommendations.push({
      id: `rec-k8s-${idCounter++}`,
      category: 'Kubernetes',
      title: 'Enable Cluster Autoscaler & Optimize Container Resource Limits',
      description: 'Review of cluster deployment shows pod requests significantly higher than actual CPU/Memory consumption. Right-sizing container limits will allow nodes to pack more tightly and reduce VM nodes count.',
      resourceId: 'kubernetes-clusters',
      provider,
      impact: 'medium',
      potentialSavings: 280.0,
      effort: 'moderate',
      actionableSteps: [
        'Deploy the Kubernetes Metrics Server to track pod utilization.',
        'Review namespace usage and set resource quotas.',
        'Adjust limits and requests in deployment manifests based on historical CPU/RAM peaks.',
        'Enable Cluster Autoscaler on the node pools to automatically spin down empty VMs.'
      ]
    });

    // 6. Serverless Recommendations
    const hasLambda = records.some(r => r.service.toLowerCase().includes('lambda') || r.service.toLowerCase().includes('functions'));
    recommendations.push({
      id: `rec-serv-${idCounter++}`,
      category: 'Serverless',
      title: 'Optimize Serverless Memory Allocations',
      description: 'Some functions are allocated with default 1024MB RAM but only utilize 128MB. Fine-tuning memory parameters will decrease GB-Second execution charges.',
      resourceId: 'serverless-functions',
      provider,
      impact: 'low',
      potentialSavings: 45.0,
      effort: 'easy',
      actionableSteps: [
        'Use AWS Lambda Power Tuning (or cloud equivalent) to run performance tests across memory configurations.',
        'Modify function configurations to the mathematically optimal memory tier.',
        'Reduces execution time and costs simultaneously.'
      ]
    });

    // 7. Security Cost Recommendations
    recommendations.push({
      id: `rec-sec-${idCounter++}`,
      category: 'Security',
      title: 'Configure Log Retention & Clean Up Inactive Secrets',
      description: 'Logging vaults are configured with "Never Expire" policy. Deleting inactive IAM roles, unused KMS keys, and setting log group retention to 30 days reduces backup storage overhead.',
      resourceId: 'security-logging-groups',
      provider,
      impact: 'low',
      potentialSavings: 85.0,
      effort: 'easy',
      actionableSteps: [
        'Query AWS Secrets Manager for secrets not accessed in the last 90 days and mark for deletion.',
        'Scan CloudWatch Log Groups and change retention from "Never Expire" to "30 Days" for staging/development.',
        'Disable KMS keys that are no longer assigned to any encrypted volumes.'
      ]
    });

    return recommendations;
  }
}
