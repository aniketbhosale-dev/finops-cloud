import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockDir = path.join(__dirname, '../mock-data');

// Re-implement generation inside script to run directly with node
function getDaysArray(start, end) {
  const arr = [];
  const dt = new Date(start);
  while (dt <= end) {
    arr.push(new Date(dt).toISOString().split('T')[0]);
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}

function generateAWSMock() {
  const headers = [
    'lineItem/LineItemId',
    'lineItem/UnblendedCost',
    'lineItem/UsageStartDate',
    'product/ServiceCode',
    'product/region',
    'lineItem/UsageAccountId',
    'lineItem/ResourceId',
    'lineItem/UsageType',
    'resourceTags/user:Environment',
    'resourceTags/user:Team',
    'resourceTags/user:Application'
  ];

  const csvRows = [headers.join(',')];
  const dates = getDaysArray(new Date('2026-06-01'), new Date('2026-06-28'));
  let idCounter = 1;

  dates.forEach((date) => {
    const isAnomalyDay = date === '2026-06-25';

    // 1. EC2 Compute - Prod Web
    csvRows.push([
      `id-aws-${idCounter++}`,
      '48.00',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'i-0abc123456789def0',
      'BoxUsage:m5.xlarge',
      'Production',
      'Frontend',
      'WebSaaS'
    ].join(','));

    // 2. EC2 Compute - Dev VM (Underutilized)
    csvRows.push([
      `id-aws-${idCounter++}`,
      '24.00',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-west-2',
      '123456789012',
      'i-0dev987654321abc0',
      'BoxUsage:t3.xlarge',
      'Development',
      'QA',
      'AdminPortal'
    ].join(','));

    // 3. S3 Storage
    csvRows.push([
      `id-aws-${idCounter++}`,
      '12.50',
      `${date}T00:00:00Z`,
      'AmazonS3',
      'us-east-1',
      '123456789012',
      's3-media-assets',
      'TimedStorage-ByteHrs',
      'Production',
      'Frontend',
      'WebSaaS'
    ].join(','));

    // 4. RDS Database
    csvRows.push([
      `id-aws-${idCounter++}`,
      '35.00',
      `${date}T00:00:00Z`,
      'AmazonRDS',
      'us-east-1',
      '123456789012',
      'rds-mysql-prod',
      'db.m5.large',
      'Production',
      'Backend',
      'WebSaaS'
    ].join(','));

    // 5. RDS Read Replica (Idle)
    csvRows.push([
      `id-aws-${idCounter++}`,
      '18.00',
      `${date}T00:00:00Z`,
      'AmazonRDS',
      'us-west-2',
      '123456789012',
      'rds-mysql-replica-dev',
      'db.t3.medium',
      'Development',
      'Backend',
      'AdminPortal'
    ].join(','));

    // Hidden Charges
    // 6. NAT Gateway
    const natGatewayCost = isAnomalyDay ? 750.00 : 22.50;
    csvRows.push([
      `id-aws-${idCounter++}`,
      natGatewayCost.toFixed(2),
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'nat-0123456789abcdef0',
      'NatGateway-Hours',
      'Production',
      'Ops',
      'Infrastructure'
    ].join(','));

    // 7. Elastic IP (Idle)
    csvRows.push([
      `id-aws-${idCounter++}`,
      '3.60',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'eipalloc-01234567',
      'ElasticIP:Idle',
      'Development',
      'Ops',
      'Infrastructure'
    ].join(','));

    // 8. Public IPv4 Charges
    csvRows.push([
      `id-aws-${idCounter++}`,
      '2.40',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'i-0abc123456789def0',
      'PublicIPv4:Charge',
      'Production',
      'Frontend',
      'WebSaaS'
    ].join(','));

    // 9. EBS Volumes (Unattached)
    csvRows.push([
      `id-aws-${idCounter++}`,
      '4.50',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'vol-0a1b2c3d4e5f6g7h8',
      'EBS:Volume',
      'Staging',
      'Ops',
      'Infrastructure'
    ].join(','));

    // 10. EBS Snapshots (Old)
    csvRows.push([
      `id-aws-${idCounter++}`,
      '6.00',
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'snap-0987654321fedcba',
      'EBS:Snapshot',
      'Production',
      'Ops',
      'Infrastructure'
    ].join(','));

    // 11. Cross Availability Zone Traffic
    const crossAzCost = isAnomalyDay ? 240.00 : 8.20;
    csvRows.push([
      `id-aws-${idCounter++}`,
      crossAzCost.toFixed(2),
      `${date}T00:00:00Z`,
      'AmazonEC2',
      'us-east-1',
      '123456789012',
      'i-0abc123456789def0',
      'DataTransfer-Regional-Bytes',
      'Production',
      'Backend',
      'WebSaaS'
    ].join(','));

    // 12. CloudWatch Logs
    csvRows.push([
      `id-aws-${idCounter++}`,
      '7.80',
      `${date}T00:00:00Z`,
      'AmazonCloudWatch',
      'us-east-1',
      '123456789012',
      'log-group-prod-app',
      'CloudWatch-Logs',
      'Production',
      'Backend',
      'WebSaaS'
    ].join(','));

    // 13. Idle Load Balancer
    csvRows.push([
      `id-aws-${idCounter++}`,
      '12.00',
      `${date}T00:00:00Z`,
      'AWSELB',
      'us-west-2',
      '123456789012',
      'alb-dev-internal',
      'ElasticLoadBalancing:Idle',
      'Development',
      'Ops',
      'AdminPortal'
    ].join(','));
  });

  return csvRows.join('\n');
}

function generateAzureMock() {
  const headers = [
    'Date',
    'SubscriptionId',
    'ServiceDisplayName',
    'ResourceLocation',
    'CostInBillingCurrency',
    'InstanceId',
    'ResourceGroupName',
    'Tags'
  ];

  const csvRows = [headers.join(',')];
  const dates = getDaysArray(new Date('2026-06-01'), new Date('2026-06-28'));
  let idCounter = 1;

  dates.forEach((date) => {
    const isAnomalyDay = date === '2026-06-25';

    // 1. Virtual Machines (Prod)
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Virtual Machines',
      'eastus',
      '65.00',
      `vm-prod-${idCounter++}`,
      'rg-prod-web',
      '"environment:Production;team:Frontend;application:WebSaaS"'
    ].join(','));

    // 2. Virtual Machines (Dev)
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Virtual Machines',
      'westus',
      '30.00',
      `vm-dev-${idCounter++}`,
      'rg-dev-qa',
      '"environment:Development;team:QA;application:AdminPortal"'
    ].join(','));

    // 3. Azure SQL Database
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'SQL Database',
      'eastus',
      '42.00',
      `sql-prod-db`,
      'rg-prod-data',
      '"environment:Production;team:Backend;application:WebSaaS"'
    ].join(','));

    // 4. Log Analytics
    const logAnalyticsCost = isAnomalyDay ? 480.00 : 15.00;
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Log Analytics',
      'eastus',
      logAnalyticsCost.toFixed(2),
      'la-workspace-prod',
      'rg-prod-ops',
      '"environment:Production;team:Ops;application:Infrastructure"'
    ].join(','));

    // 5. Azure Firewall
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Azure Firewall',
      'eastus',
      '28.80',
      'fw-prod-east',
      'rg-prod-network',
      '"environment:Production;team:Ops;application:Infrastructure"'
    ].join(','));

    // 6. VPN Gateway
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'VPN Gateway',
      'westus2',
      '11.50',
      'vpn-dev-gateway',
      'rg-dev-network',
      '"environment:Development;team:Ops;application:AdminPortal"'
    ].join(','));

    // 7. Managed Disks (Unattached)
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Managed Disks',
      'eastus',
      '5.20',
      'disk-unattached-01',
      'rg-prod-storage',
      '"environment:Production;team:Ops;application:Infrastructure"'
    ].join(','));

    // 8. Public IP (Unused)
    csvRows.push([
      `${date} 00:00:00`,
      'sub-azure-999',
      'Public IP Addresses',
      'eastus',
      '1.80',
      'ip-unused-02',
      'rg-prod-network',
      '"environment:Production;team:Ops;application:Infrastructure"'
    ].join(','));
  });

  return csvRows.join('\n');
}

function generateGCPMock() {
  const headers = [
    'usage_start_time',
    'project/id',
    'service/description',
    'location/region',
    'cost',
    'resource/name',
    'labels'
  ];

  const csvRows = [headers.join(',')];
  const dates = getDaysArray(new Date('2026-06-01'), new Date('2026-06-28'));
  let idCounter = 1;

  dates.forEach((date) => {
    const isAnomalyDay = date === '2026-06-25';

    // 1. Compute Engine (Prod)
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Compute Engine',
      'us-central1',
      '58.00',
      `instance-prod-${idCounter++}`,
      '"{""environment"":""Production"",""team"":""Frontend"",""application"":""WebSaaS""}"'
    ].join(','));

    // 2. Compute Engine (Dev)
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Compute Engine',
      'us-east4',
      '22.00',
      `instance-dev-${idCounter++}`,
      '"{""environment"":""Development"",""team"":""QA"",""application"":""AdminPortal""}"'
    ].join(','));

    // 3. Cloud SQL
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Cloud SQL',
      'us-central1',
      '38.00',
      'sql-prod-master',
      '"{""environment"":""Production"",""team"":""Backend"",""application"":""WebSaaS""}"'
    ].join(','));

    // 4. Cloud NAT
    const cloudNatCost = isAnomalyDay ? 600.00 : 18.00;
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Cloud NAT',
      'us-central1',
      cloudNatCost.toFixed(2),
      'nat-gateway-central',
      '"{""environment"":""Production"",""team"":""Ops"",""application"":""Infrastructure""}"'
    ].join(','));

    // 5. Cloud Storage Operations
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Cloud Storage',
      'us-central1',
      '14.50',
      'bucket-prod-backups',
      '"{""environment"":""Production"",""team"":""Ops"",""application"":""Infrastructure""}"'
    ].join(','));

    // 6. Static IP (Unused)
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Compute Engine',
      'us-east1',
      '2.20',
      'ip-static-unused',
      '"{""environment"":""Development"",""team"":""Ops"",""application"":""AdminPortal""}"'
    ].join(','));

    // 7. Stackdriver Logging
    csvRows.push([
      `${date} 00:00:00 UTC`,
      'gcp-prod-billing',
      'Stackdriver Logging',
      'us-central1',
      '9.60',
      'logging-workspace',
      '"{""environment"":""Production"",""team"":""Backend"",""application"":""WebSaaS""}"'
    ].join(','));
  });

  return csvRows.join('\n');
}

// Ensure mock directory exists
if (!fs.existsSync(mockDir)) {
  fs.mkdirSync(mockDir, { recursive: true });
}

fs.writeFileSync(path.join(mockDir, 'aws-sample-billing.csv'), generateAWSMock());
fs.writeFileSync(path.join(mockDir, 'azure-sample-billing.csv'), generateAzureMock());
fs.writeFileSync(path.join(mockDir, 'gcp-sample-billing.csv'), generateGCPMock());

console.log('Mock CSV databases created successfully in dark-disk/mock-data/.');
