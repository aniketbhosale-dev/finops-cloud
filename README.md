# Finops Cloud Cost Analyzer

A comprehensive cloud billing analysis tool that parses CSV billing reports from AWS, Azure, and GCP, providing rich insights, anomaly detection, cost optimization recommendations, and interactive dashboards.

## Features

- **Multi-Cloud Support** — Parse and analyze billing reports from AWS, Azure, and GCP
- **Smart CSV Parsing** — Auto-detects cloud provider from column headers
- **Interactive Dashboard** — 8-tab interface with charts, tables, and visualizations
- **Anomaly Detection** — Weighted moving average with anomaly scoring (0-100)
- **Cost Optimization** — Priority-scored recommendations with ROI analysis
- **Executive Insights** — Natural language summaries of spend patterns and waste
- **Forecasting** — Trend decomposition with confidence intervals
- **Waste Analysis** — Identify zombie, idle, and underutilized resources
- **Cost Allocation** — Breakdown by service, region, environment, team, and application

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Astro 7 | Full-stack web framework with SSR |
| Tailwind CSS 4 | Utility-first styling |
| TypeScript | Type-safe development |
| ECharts 6 | Interactive charts and visualizations |
| Node.js | Server-side API processing |

## Getting Started

### Prerequisites

- Node.js >= 22.12.0
- npm or yarn

### Installation

```bash
cd dark-disk
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Usage

1. **Upload CSV** — Drag and drop or click to select a billing report CSV file
2. **Select Provider** — Choose AWS, Azure, or GCP (or let auto-detect handle it)
3. **View Analysis** — Explore the 8-tab dashboard:
   - **Insights** — Executive summary with period comparison and natural language insights
   - **Overview** — Daily spend trends, service allocation, and regional distribution
   - **Breakdown** — Detailed cost breakdown by service, region, environment, and tags
   - **Efficiency** — Cost metrics, Gini coefficient, Pareto analysis, and service trends
   - **Allocation** — Interactive cost allocation across service/region/env/team/app
   - **Anomalies** — Detected anomalies with severity scores and daily impact
   - **Recommendations** — Priority-scored optimization suggestions with ROI
   - **Forecast** — EOM, EOQ, and yearly cost projections with confidence intervals

## Supported CSV Formats

### AWS Cost and Usage Report
- Required columns: `lineitem/unblendedcost`, `lineitem/usagestartdate`, `product/servicecode`
- Supports custom tags via `resourcetags/user:*` prefix

### Azure Cost Management
- Required columns: `costinbillingcurrency`, `date`, `servicedisplayname`
- Supports JSON and semicolon-separated tags

### GCP Billing Export
- Required columns: `cost`, `usage_start_time`, `service/description`
- Supports `labels` and `project/labels` fields

## Analysis Modules

| Module | Description |
|--------|-------------|
| `parser.ts` | CSV parsing with provider-specific normalization |
| `analyzer.ts` | Core analysis: trends, efficiency, waste, allocation |
| `anomalies.ts` | Weighted moving average anomaly detection |
| `recommender.ts` | Priority-scored cost optimization recommendations |
| `forecaster.ts` | Trend decomposition with confidence intervals |
| `insights.ts` | Natural language executive insight generation |

## Project Structure

```
dark-disk/
├── public/
├── src/
│   ├── components/
│   │   ├── Charts/
│   │   │   └── EChart.astro      # ECharts wrapper component
│   │   ├── SummaryCards.astro     # Executive summary cards
│   │   ├── DashboardView.astro    # Main 8-tab dashboard
│   │   ├── UploadZone.astro       # File upload with provider selection
│   │   └── Welcome.astro          # Landing page
│   ├── layouts/
│   │   └── Layout.astro           # Base HTML layout
│   ├── lib/
│   │   ├── analyzer.ts            # Core cost analysis engine
│   │   ├── anomalies.ts           # Anomaly detection
│   │   ├── forecaster.ts          # Cost forecasting
│   │   ├── insights.ts            # Insight generation
│   │   ├── mockGenerator.ts       # Mock data for testing
│   │   ├── parser.ts              # CSV parsing
│   │   ├── recommender.ts         # Optimization recommendations
│   │   └── types.ts               # TypeScript interfaces
│   └── pages/
│       ├── api/
│       │   └── analyze.ts         # POST /api/analyze endpoint
│       └── index.astro            # Main page
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## API Endpoint

### POST /api/analyze

Accepts multipart form data with:
- `file` — CSV billing report (max 50MB)
- `provider` — `aws`, `azure`, or `gcp` (optional, auto-detected)

Returns JSON with full analysis results including trends, anomalies, recommendations, forecasts, and insights.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:4321 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run astro` | Run Astro CLI commands |

## License

MIT
