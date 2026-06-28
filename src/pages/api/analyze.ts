import type { APIRoute } from 'astro';
import { CostReportParser } from '../../lib/parser';
import { CostAnalyzer } from '../../lib/analyzer';
import { AnomalyDetector } from '../../lib/anomalies';
import { RecommendationEngine } from '../../lib/recommender';
import { ForecastingEngine } from '../../lib/forecaster';
import { generateInsights } from '../../lib/insights';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    const csvFile = data.get('file') as File;
    const rawProvider = data.get('provider') as string;
    const cloudProvider = rawProvider?.toLowerCase() as 'aws' | 'azure' | 'gcp' | undefined;

    console.log('[analyze] rawProvider:', rawProvider, '→ cloudProvider:', cloudProvider);

    if (!csvFile) {
      return new Response(JSON.stringify({ error: 'No file uploaded. Please select a valid CSV billing report.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (csvFile.size > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 50MB.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const csvText = await csvFile.text();
    if (!csvText || csvText.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'File is empty. Please upload a valid CSV billing report.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Parse CSV
    const records = CostReportParser.parse(csvText, cloudProvider as 'aws' | 'azure' | 'gcp');
    if (records.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid billing records found. Check CSV format and column headers.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    console.log(`[analyze] parsed ${records.length} records`);

    // 2. Detect resource health first (needed for analyzer waste analysis)
    const resourceHealth = AnomalyDetector.analyzeResourceHealth(records);

    // 3. Core analysis with waste detection
    const analysis = CostAnalyzer.analyze(records, resourceHealth);

    // 4. Anomalies
    const anomalies = AnomalyDetector.detect(records);

    // 5. Recommendations (sorted by priority)
    const recommendations = RecommendationEngine.generate(records, resourceHealth);

    // 6. Optimization score
    const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);
    const monthlySpend = analysis.currentMonthSpend;
    const optimizationScore = monthlySpend > 0
      ? Math.max(10, Math.min(100, Math.round(100 - (totalPotentialSavings / (monthlySpend + totalPotentialSavings)) * 100)))
      : 100;

    // 7. Forecasts
    const forecasts = ForecastingEngine.generate(records, analysis.dailySpend, monthlySpend);

    // 8. Generate executive insights
    const fullResults = { ...analysis, optimizationScore, anomalies, recommendations, resourceHealth, forecasts, insights: [] as any[] };
    const insights = generateInsights(fullResults as any);

    // Assemble final payload
    const results = {
      ...analysis,
      optimizationScore,
      anomalies,
      recommendations,
      resourceHealth,
      forecasts,
      insights
    };

    console.log(`[analyze] complete: ${anomalies.length} anomalies, ${recommendations.length} recommendations, ${insights.length} insights, score: ${analysis.finopsScore}`);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    });
  } catch (error: any) {
    console.error('[analyze] API Error:', error);
    const message = error.message || 'Failed to parse and process the billing report.';
    const status = message.includes('empty') || message.includes('Could not identify') ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { 'Content-Type': 'application/json' }
    });
  }
};
