import type { APIRoute } from 'astro';
import { CostReportParser } from '../../lib/parser';
import { CostAnalyzer } from '../../lib/analyzer';
import { AnomalyDetector } from '../../lib/anomalies';
import { RecommendationEngine } from '../../lib/recommender';
import { ForecastingEngine } from '../../lib/forecaster';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    const csvFile = data.get('file') as File;

    if (!csvFile) {
      return new Response(JSON.stringify({ error: 'No file uploaded. Please select a valid CSV billing report.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const csvText = await csvFile.text();

    // 1. Parse CSV & Normalize
    const records = CostReportParser.parse(csvText);

    // 2. Perform core cost aggregations & breakdowns
    const analysis = CostAnalyzer.analyze(records);

    // 3. Detect spending anomalies & spikes
    const anomalies = AnomalyDetector.detect(records);

    // 4. Scrutinize resource health (idle/zombies)
    const resourceHealth = AnomalyDetector.analyzeResourceHealth(records);

    // 5. Generate cost optimization recommendations
    const recommendations = RecommendationEngine.generate(records, resourceHealth);

    // 6. Complete the optimization score based on savings potential
    const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);
    const monthlySpend = analysis.currentMonthSpend;
    const optimizationScore = monthlySpend > 0 
      ? Math.max(10, Math.min(100, Math.round(100 - (totalPotentialSavings / (monthlySpend + totalPotentialSavings)) * 100)))
      : 100;

    // 7. Perform EOM, EOQ, and Yearly predictions
    const forecasts = ForecastingEngine.generate(records, analysis.dailySpend, monthlySpend);

    // Assemble full report payload
    const results = {
      ...analysis,
      optimizationScore,
      anomalies,
      recommendations,
      resourceHealth,
      forecasts
    };

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    console.error('API Error processing report:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to parse and process the billing report. Verify it has the correct CSV headers.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
