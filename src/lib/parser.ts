import type { BillingRecord, CloudProvider } from './types';

// Helper to parse CSV string into 2D string array
export function parseCSV(csvContent: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentField.trim());
        currentField = '';
        if (row.length > 0 && row.some(cell => cell !== '')) {
          result.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // skip newline
        }
      } else {
        currentField += char;
      }
    }
  }

  if (currentField !== '' || row.length > 0) {
    row.push(currentField.trim());
    if (row.some(cell => cell !== '')) {
      result.push(row);
    }
  }

  return result;
}

// Parse Azure/GCP tags which could be JSON or semicolon-separated
function parseTags(tagsStr: string): Record<string, string> {
  if (!tagsStr) return {};
  
  // Try parsing as JSON
  try {
    if (tagsStr.startsWith('{') && tagsStr.endsWith('}')) {
      return JSON.parse(tagsStr);
    }
  } catch (e) {
    // Fail silently, fallback to key-value parsing
  }

  // Parse as key-value pairs separated by semicolon, comma, or space
  const tags: Record<string, string> = {};
  const pairs = tagsStr.split(/[;,]/);
  
  for (const pair of pairs) {
    const parts = pair.split(/[:=]/);
    if (parts.length >= 2) {
      const key = parts[0].trim().replace(/['"{}?]/g, '');
      const val = parts[1].trim().replace(/['"{}?]/g, '');
      if (key) {
        tags[key] = val;
      }
    }
  }
  
  return tags;
}

// Find key in tags case insensitively
function findTagValue(tags: Record<string, string>, keysToMatch: string[]): string {
  const lowercaseKeys = keysToMatch.map(k => k.toLowerCase());
  for (const [key, value] of Object.entries(tags)) {
    if (lowercaseKeys.includes(key.toLowerCase())) {
      return value;
    }
  }
  return '';
}

// Map environment value to standard union
function mapEnvironment(envStr: string): 'Production' | 'Development' | 'Staging' | 'Test' | 'Unknown' {
  if (!envStr) return 'Unknown';
  const val = envStr.toLowerCase();
  if (val.includes('prod') || val === 'prd' || val === 'p') return 'Production';
  if (val.includes('dev') || val === 'development' || val === 'd') return 'Development';
  if (val.includes('stag') || val.includes('preprod') || val === 's') return 'Staging';
  if (val.includes('test') || val === 'tst' || val === 't') return 'Test';
  return 'Unknown';
}

export class CostReportParser {
  static detectProvider(headers: string[]): CloudProvider {
    const lowercaseHeaders = headers.map(h => h.toLowerCase());
    
    // AWS specific columns
    if (
      lowercaseHeaders.includes('lineitem/unblendedcost') || 
      lowercaseHeaders.includes('lineitem/lineitemtype') || 
      lowercaseHeaders.includes('product/servicecode') || 
      lowercaseHeaders.includes('identity/lineitemid')
    ) {
      return 'aws';
    }
    
    // Azure specific columns
    if (
      lowercaseHeaders.includes('costinbillingcurrency') || 
      lowercaseHeaders.includes('subscriptionid') || 
      lowercaseHeaders.includes('resourcegroupname') || 
      lowercaseHeaders.includes('serviceplacedin') ||
      lowercaseHeaders.includes('servicedisplayname')
    ) {
      return 'azure';
    }
    
    // GCP specific columns
    if (
      lowercaseHeaders.includes('usage_start_time') || 
      lowercaseHeaders.includes('project/id') || 
      lowercaseHeaders.includes('service/description') || 
      lowercaseHeaders.includes('sku/description')
    ) {
      return 'gcp';
    }
    
    // Default fallback based on simple heuristic or throw error
    if (lowercaseHeaders.some(h => h.includes('aws') || h.includes('amazon'))) return 'aws';
    if (lowercaseHeaders.some(h => h.includes('azure') || h.includes('subscription'))) return 'azure';
    if (lowercaseHeaders.some(h => h.includes('gcp') || h.includes('project_id') || h.includes('google'))) return 'gcp';
    
    throw new Error('Could not identify cloud provider from billing report headers.');
  }

  static parse(csvString: string): BillingRecord[] {
    const rows = parseCSV(csvString);
    if (rows.length < 2) {
      throw new Error('Billing report is empty or missing data rows.');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const provider = this.detectProvider(headers);

    switch (provider) {
      case 'aws':
        return this.normalizeAWS(dataRows, headers);
      case 'azure':
        return this.normalizeAzure(dataRows, headers);
      case 'gcp':
        return this.normalizeGCP(dataRows, headers);
      default:
        throw new Error('Unsupported cloud provider.');
    }
  }

  private static normalizeAWS(rows: string[][], headers: string[]): BillingRecord[] {
    const idxCost = headers.findIndex(h => h.toLowerCase() === 'lineitem/unblendedcost' || h.toLowerCase() === 'lineitem/blendedcost' || h.toLowerCase() === 'cost');
    const idxDate = headers.findIndex(h => h.toLowerCase() === 'lineitem/usagestartdate' || h.toLowerCase() === 'usage_start_date' || h.toLowerCase() === 'date');
    const idxService = headers.findIndex(h => h.toLowerCase() === 'product/servicecode' || h.toLowerCase() === 'lineitem/productcode' || h.toLowerCase() === 'service');
    const idxRegion = headers.findIndex(h => h.toLowerCase() === 'product/region' || h.toLowerCase() === 'lineitem/availabilityzone' || h.toLowerCase() === 'region');
    const idxAccount = headers.findIndex(h => h.toLowerCase() === 'lineitem/usageaccountid' || h.toLowerCase() === 'account_id' || h.toLowerCase() === 'account');
    const idxResourceId = headers.findIndex(h => h.toLowerCase() === 'lineitem/resourceid' || h.toLowerCase() === 'resource_id' || h.toLowerCase() === 'resourceid');
    const idxUsageType = headers.findIndex(h => h.toLowerCase() === 'lineitem/usagetype' || h.toLowerCase() === 'usagetype');

    // Find custom tag headers
    const tagPrefix = 'resourcetags/user:';
    const tagHeaders = headers.map((h, i) => ({ header: h.toLowerCase(), index: i })).filter(x => x.header.startsWith(tagPrefix));

    return rows.map((row, index) => {
      const cost = parseFloat(row[idxCost]) || 0;
      // Get Date as YYYY-MM-DD
      const rawDate = row[idxDate] || '';
      const date = rawDate.split('T')[0] || new Date().toISOString().split('T')[0];
      const service = row[idxService] || 'Other';
      const region = row[idxRegion] || 'Global';
      const account = row[idxAccount] || 'AWS-Account';
      const resourceId = row[idxResourceId] || '';
      const usageType = row[idxUsageType] || '';

      // Collect tags
      const tags: Record<string, string> = {};
      for (const th of tagHeaders) {
        const key = th.header.substring(tagPrefix.length);
        const val = row[th.index];
        if (val) {
          tags[key] = val;
        }
      }

      // Check if there are other tag headers that don't match prefix
      headers.forEach((h, i) => {
        const lh = h.toLowerCase();
        if (lh === 'tags' || lh === 'resource_tags') {
          Object.assign(tags, parseTags(row[i]));
        }
      });

      const environmentVal = findTagValue(tags, ['environment', 'env', 'stage']);
      const teamVal = findTagValue(tags, ['team', 'owner', 'dept']);
      const applicationVal = findTagValue(tags, ['application', 'app', 'project']);

      return {
        id: `aws-${index}`,
        provider: 'aws',
        date,
        service,
        cost,
        region,
        account,
        resourceId,
        resourceGroup: usageType, // map usageType to resourceGroup for AWS
        environment: mapEnvironment(environmentVal),
        team: teamVal || 'Shared',
        application: applicationVal || 'Legacy',
        tags
      };
    });
  }

  private static normalizeAzure(rows: string[][], headers: string[]): BillingRecord[] {
    const idxCost = headers.findIndex(h => h.toLowerCase() === 'costinbillingcurrency' || h.toLowerCase() === 'cost' || h.toLowerCase() === 'pretaxcost');
    const idxDate = headers.findIndex(h => h.toLowerCase() === 'date' || h.toLowerCase() === 'usagedatetime');
    const idxService = headers.findIndex(h => h.toLowerCase() === 'servicedisplayname' || h.toLowerCase() === 'metercategory' || h.toLowerCase() === 'service');
    const idxRegion = headers.findIndex(h => h.toLowerCase() === 'resourcelocation' || h.toLowerCase() === 'region');
    const idxAccount = headers.findIndex(h => h.toLowerCase() === 'subscriptionid' || h.toLowerCase() === 'subscriptionname' || h.toLowerCase() === 'account');
    const idxResourceId = headers.findIndex(h => h.toLowerCase() === 'resourceid' || h.toLowerCase() === 'instanceid');
    const idxResourceGroup = headers.findIndex(h => h.toLowerCase() === 'resourcegroupname' || h.toLowerCase() === 'resourcegroup');
    const idxTags = headers.findIndex(h => h.toLowerCase() === 'tags' || h.toLowerCase() === 'resourcetags');

    return rows.map((row, index) => {
      const cost = parseFloat(row[idxCost]) || 0;
      // Get Date as YYYY-MM-DD
      const rawDate = row[idxDate] || '';
      const date = rawDate.split(' ')[0]?.split('T')[0] || new Date().toISOString().split('T')[0];
      const service = row[idxService] || 'Other';
      const region = row[idxRegion] || 'Global';
      const account = row[idxAccount] || 'Azure-Subscription';
      const resourceId = row[idxResourceId] || '';
      const resourceGroup = row[idxResourceGroup] || 'Resource-Group';

      const tags = idxTags !== -1 ? parseTags(row[idxTags]) : {};
      
      const environmentVal = findTagValue(tags, ['environment', 'env', 'stage']);
      const teamVal = findTagValue(tags, ['team', 'owner', 'dept']);
      const applicationVal = findTagValue(tags, ['application', 'app', 'project']);

      return {
        id: `azure-${index}`,
        provider: 'azure',
        date,
        service,
        cost,
        region,
        account,
        resourceId,
        resourceGroup,
        environment: mapEnvironment(environmentVal),
        team: teamVal || 'Shared',
        application: applicationVal || 'Legacy',
        tags
      };
    });
  }

  private static normalizeGCP(rows: string[][], headers: string[]): BillingRecord[] {
    const idxCost = headers.findIndex(h => h.toLowerCase() === 'cost' || h.toLowerCase() === 'total_cost');
    const idxDate = headers.findIndex(h => h.toLowerCase() === 'usage_start_time' || h.toLowerCase() === 'date');
    const idxService = headers.findIndex(h => h.toLowerCase() === 'service/description' || h.toLowerCase() === 'service_description' || h.toLowerCase() === 'service');
    const idxRegion = headers.findIndex(h => h.toLowerCase() === 'location/region' || h.toLowerCase() === 'region');
    const idxAccount = headers.findIndex(h => h.toLowerCase() === 'project/id' || h.toLowerCase() === 'project_id' || h.toLowerCase() === 'account');
    const idxResourceId = headers.findIndex(h => h.toLowerCase() === 'resource/name' || h.toLowerCase() === 'resource_name');
    const idxLabels = headers.findIndex(h => h.toLowerCase() === 'labels' || h.toLowerCase() === 'project/labels');

    return rows.map((row, index) => {
      const cost = parseFloat(row[idxCost]) || 0;
      // Get Date as YYYY-MM-DD
      const rawDate = row[idxDate] || '';
      const date = rawDate.split(' ')[0]?.split('T')[0] || new Date().toISOString().split('T')[0];
      const service = row[idxService] || 'Other';
      const region = row[idxRegion] || 'Global';
      const account = row[idxAccount] || 'GCP-Project';
      const resourceId = row[idxResourceId] || '';

      const tags = idxLabels !== -1 ? parseTags(row[idxLabels]) : {};
      
      const environmentVal = findTagValue(tags, ['environment', 'env', 'stage']);
      const teamVal = findTagValue(tags, ['team', 'owner', 'dept']);
      const applicationVal = findTagValue(tags, ['application', 'app', 'project']);

      return {
        id: `gcp-${index}`,
        provider: 'gcp',
        date,
        service,
        cost,
        region,
        account,
        resourceId,
        resourceGroup: account, // GCP uses project/id for resourceGroup boundary
        environment: mapEnvironment(environmentVal),
        team: teamVal || 'Shared',
        application: applicationVal || 'Legacy',
        tags
      };
    });
  }
}
