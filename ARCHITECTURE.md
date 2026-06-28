# Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FINOPS CLOUD COST ANALYZER                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CLIENT (Browser)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │  UploadZone  │  │ SummaryCards│  │DashboardView│                │   │
│  │  │  (Drag &     │  │  (5-card    │  │  (8-tab     │                │   │
│  │  │   Drop)      │  │   hero)     │  │   layout)   │                │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │   │
│  │         │                │                │                         │   │
│  │         └────────────────┼────────────────┘                         │   │
│  │                          │                                          │   │
│  │                    POST /api/analyze                                │   │
│  └──────────────────────────┼──────────────────────────────────────────┘   │
│                             │                                               │
├─────────────────────────────┼───────────────────────────────────────────────┤
│                             ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SERVER (Astro SSR)                               │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                   API Endpoint                              │   │   │
│  │  │              POST /api/analyze                              │   │   │
│  │  │                                                             │   │   │
│  │  │  1. Validate file (size, empty)                             │   │   │
│  │  │  2. Detect provider (aws/azure/gcp)                         │   │   │
│  │  │  3. Execute analysis pipeline                               │   │   │
│  │  │  4. Return JSON response                                    │   │   │
│  │  └──────────────────────────┬──────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │  ┌──────────────────────────┼──────────────────────────────────┐   │   │
│  │  │              ANALYSIS PIPELINE                              │   │   │
│  │  │                                                             │   │   │
│  │  │  ┌─────────┐    ┌─────────┐    ┌─────────┐                │   │   │
│  │  │  │ PARSER  │───▶│ANALYZER │───▶│ANOMALIES│                │   │   │
│  │  │  │         │    │         │    │         │                │   │   │
│  │  │  │• CSV    │    │• Trends │    │• Weighted│                │   │   │
│  │  │  │• Detect │    │• Waste  │    │  Moving  │                │   │   │
│  │  │  │• Norm   │    │• Alloc  │    │  Average │                │   │   │
│  │  │  └─────────┘    └─────────┘    └─────────┘                │   │   │
│  │  │                                                             │   │   │
│  │  │  ┌─────────┐    ┌─────────┐    ┌─────────┐                │   │   │
│  │  │  │RECOMMEND│───▶│FORECAST │───▶│INSIGHTS │                │   │   │
│  │  │  │         │    │         │    │         │                │   │   │
│  │  │  │• Priority│    │• Trend  │    │• NL     │                │   │   │
│  │  │  │• ROI    │    │• Confi  │    │  Summar │                │   │   │
│  │  │  │• Action │    │  dence  │    │• Exec   │                │   │   │
│  │  │  └─────────┘    └─────────┘    └─────────┘                │   │   │
│  │  └────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │     │              │
│   CSV File   │────▶│   PARSER     │────▶│  ANALYZER    │────▶│  FRONTEND    │
│   (Upload)   │     │              │     │              │     │              │
│              │     │              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ • Provider   │     │ • BillingRecord[]  │ • AnalysisResults│    │ • Charts     │
│ • File Size  │     │ • Tags        │    │ • Anomalies  │     │ • Tables     │
│ • Validation │     │ • Normalized  │     │ • Recommend  │     │ • Insights   │
│              │     │   Fields      │     │ • Forecast   │     │ • Metrics    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Astro Pages                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  index.astro (Main Page)                                                   │
│  ├── Layout.astro (HTML Shell)                                             │
│  ├── UploadZone.astro (File Upload)                                        │
│  │   ├── Provider Modal                                                    │
│  │   ├── Drag & Drop                                                       │
│  │   └── Demo Buttons                                                      │
│  ├── SummaryCards.astro (Executive Summary)                                │
│  │   ├── Monthly Spend                                                     │
│  │   ├── Budget Utilization                                                │
│  │   ├── EOM Forecast                                                      │
│  │   ├── FinOps Score                                                      │
│  │   └── Waste Found                                                       │
│  └── DashboardView.astro (Main Dashboard)                                  │
│      ├── Tab Navigation (8 tabs)                                           │
│      ├── Insights Tab                                                      │
│      │   ├── Period Comparison                                             │
│      │   └── Executive Insights                                            │
│      ├── Overview Tab                                                      │
│      │   ├── Daily Trend Chart                                             │
│      │   ├── Service Allocation Chart                                      │
│      │   └── Regional Chart                                                │
│      ├── Breakdown Tab                                                     │
│      │   └── Cost Breakdown Table                                          │
│      ├── Efficiency Tab                                                    │
│      │   ├── Cost Metrics                                                  │
│      │   ├── Pareto Chart                                                  │
│      │   └── Service Trends Table                                          │
│      ├── Allocation Tab                                                    │
│      │   ├── By Service                                                    │
│      │   ├── By Region                                                     │
│      │   ├── By Environment                                                │
│      │   ├── By Team                                                       │
│      │   └── By Application                                                │
│      ├── Anomalies Tab                                                     │
│      │   ├── Anomaly Cards                                                 │
│      │   └── Hidden Cost Cards                                             │
│      ├── Recommendations Tab                                               │
│      │   ├── Category Filter                                               │
│      │   └── Recommendation Cards                                          │
│      └── Forecast Tab                                                      │
│          ├── EOM/EOQ/Yearly Forecasts                                      │
│          └── Health Status                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## API & Data Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Layer                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /api/analyze                                                         │
│  ├── Request Validation                                                     │
│  │   ├── File size < 50MB                                                  │
│  │   ├── File not empty                                                    │
│  │   └── Provider validation                                               │
│  │                                                                         │
│  ├── Provider Detection                                                    │
│  │   ├── AWS: lineitem/unblendedcost, product/servicecode                  │
│  │   ├── Azure: costinbillingcurrency, servicedisplayname                  │
│  │   └── GCP: cost, usage_start_time, service/description                  │
│  │                                                                         │
│  ├── Analysis Pipeline                                                     │
│  │   ├── Step 1: Parse CSV → BillingRecord[]                               │
│  │   ├── Step 2: Resource Health Detection                                 │
│  │   ├── Step 3: Core Analysis (trends, waste, allocation)                 │
│  │   ├── Step 4: Anomaly Detection (weighted moving average)               │
│  │   ├── Step 5: Recommendations (priority-scored)                         │
│  │   ├── Step 6: Forecasts (trend decomposition)                          │
│  │   └── Step 7: Insights (natural language generation)                    │
│  │                                                                         │
│  └── Response                                                              │
│      ├── AnalysisResults (JSON)                                            │
│      │   ├── totalSpend, currentMonthSpend, dailySpend                     │
│      │   ├── trend, periodComparison, efficiency                           │
│      │   ├── waste, serviceTrends, allocation                              │
│      │   ├── anomalies[], recommendations[]                                │
│      │   ├── resourceHealth, forecasts[]                                   │
│      │   └── insights[]                                                    │
│      └── Cache-Control: no-cache                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Analysis Modules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Analysis Engine                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  parser.ts                                                          │   │
│  │  ├── CSV parsing (RFC 4180 compliant)                              │   │
│  │  ├── Provider auto-detection                                        │   │
│  │  ├── Field normalization (aws/azure/gcp → unified format)           │   │
│  │  └── Tag extraction (JSON, semicolon-separated, key:value)          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  analyzer.ts                                                        │   │
│  │  ├── computeTrendAnalysis (direction, burn rate, momentum)          │   │
│  │  ├── computePeriodComparison (current vs prior, normalized)         │   │
│  │  ├── computeEfficiency (Gini, Pareto, concentration)                │   │
│  │  ├── computeWasteAnalysis (zombie, idle, underutilized)             │   │
│  │  ├── computeServiceTrends (half-period comparison, risk)            │   │
│  │  └── computeAllocation (by service/region/env/team/app)             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  anomalies.ts                                                       │   │
│  │  ├── Weighted moving average                                        │   │
│  │  ├── Dynamic thresholds                                             │   │
│  │  ├── Anomaly scoring (0-100)                                        │   │
│  │  └── Daily impact calculation                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  recommender.ts                                                     │   │
│  │  ├── Priority scoring (1-10)                                        │   │
│  │  ├── Annual savings calculation                                     │   │
│  │  ├── ROI months calculation                                         │   │
│  │  └── Effort assessment (easy/moderate/hard)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  forecaster.ts                                                      │   │
│  │  ├── Trend decomposition                                            │   │
│  │  ├── Smoothed moving average                                        │   │
│  │  ├── Blended projection (80% trend + 20% recent)                    │   │
│  │  └── Volatility-adjusted confidence intervals                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  insights.ts                                                        │   │
│  │  ├── Spend change analysis                                          │   │
│  │  ├── Burn rate vs budget                                            │   │
│  │  ├── Trend momentum interpretation                                  │   │
│  │  └── Priority-sorted executive summaries                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tech Stack                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │    FRONTEND     │  │    BACKEND      │  │   DEPLOYMENT    │            │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤            │
│  │ Astro 7         │  │ Node.js         │  │ Standalone      │            │
│  │ Tailwind CSS 4  │  │ TypeScript      │  │ Node Adapter    │            │
│  │ ECharts 6       │  │ Astro API       │  │ SSR Enabled     │            │
│  │ Client-side JS  │  │ Server-side     │  │                 │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Request/Response Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Request/Response Cycle                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Browser                         Server                                    │
│    │                               │                                        │
│    │  POST /api/analyze           │                                        │
│    │  (FormData: file + provider) │                                        │
│    │ ─────────────────────────────▶│                                        │
│    │                               │                                        │
│    │                        ┌──────┴──────┐                                │
│    │                        │   Validate  │                                │
│    │                        │   • Size    │                                │
│    │                        │   • Empty   │                                │
│    │                        └──────┬──────┘                                │
│    │                               │                                        │
│    │                        ┌──────┴──────┐                                │
│    │                        │   Parse     │                                │
│    │                        │   • CSV     │                                │
│    │                        │   • Provider│                                │
│    │                        └──────┬──────┘                                │
│    │                               │                                        │
│    │                        ┌──────┴──────┐                                │
│    │                        │   Analyze   │                                │
│    │                        │   • Trends  │                                │
│    │                        │   • Waste   │                                │
│    │                        │   • Alloc   │                                │
│    │                        └──────┬──────┘                                │
│    │                               │                                        │
│    │                        ┌──────┴──────┐                                │
│    │                        │  Enrich     │                                │
│    │                        │  • Anomaly  │                                │
│    │                        │  • Recommend│                                │
│    │                        │  • Forecast │                                │
│    │                        │  • Insights │                                │
│    │                        └──────┬──────┘                                │
│    │                               │                                        │
│    │  200 OK                       │                                        │
│    │  { AnalysisResults }         │                                        │
│    │ ◀────────────────────────────│                                        │
│    │                               │                                        │
│    │  Render Dashboard            │                                        │
│    │  • Summary Cards             │                                        │
│    │  • 8-tab Dashboard           │                                        │
│    │  • Charts & Tables           │                                        │
│    │                               │                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```
