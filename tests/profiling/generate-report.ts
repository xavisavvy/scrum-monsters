#!/usr/bin/env node
/**
 * generate-report.ts - CLI script to generate hosting analysis report
 *
 * Reads profiling results JSON and produces markdown hosting analysis report
 * with cost comparison, bottleneck analysis, and migration recommendations.
 *
 * Usage:
 *   npx tsx tests/profiling/generate-report.ts
 *   npx tsx tests/profiling/generate-report.ts --profile tests/reports/profile-2026-02-19.json
 *   npx tsx tests/profiling/generate-report.ts --budget-min 5 --budget-max 20
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ProfileReport } from './run-profile';
import { compareHosting, ResourceRequirements } from './cost-analyzer';
import { generateReport } from './report-generator';

/**
 * CLI configuration
 */
interface CLIConfig {
  profilePath: string | null;
  budgetMin: number;
  budgetMax: number;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = {
    profilePath: null,
    budgetMin: 5,
    budgetMax: 20
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      config.profilePath = args[i + 1];
      i++;
    } else if (args[i] === '--budget-min' && args[i + 1]) {
      config.budgetMin = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--budget-max' && args[i + 1]) {
      config.budgetMax = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: tsx tests/profiling/generate-report.ts [options]

Options:
  --profile <path>      Path to profile JSON file (default: latest in tests/reports/)
  --budget-min <num>    Minimum monthly budget in USD (default: 5)
  --budget-max <num>    Maximum monthly budget in USD (default: 20)
  --help, -h            Show this help message

Examples:
  tsx tests/profiling/generate-report.ts
  tsx tests/profiling/generate-report.ts --profile tests/reports/profile-2026-02-19.json
  tsx tests/profiling/generate-report.ts --budget-min 10 --budget-max 25
`);
      process.exit(0);
    }
  }

  return config;
}

/**
 * Find the latest profile JSON in tests/reports/
 */
function findLatestProfile(): string | null {
  const reportsDir = join(process.cwd(), 'tests', 'reports');

  if (!existsSync(reportsDir)) {
    return null;
  }

  const profileFiles = readdirSync(reportsDir)
    .filter(f => f.startsWith('profile-') && f.endsWith('.json'))
    .sort()
    .reverse();  // Most recent first

  if (profileFiles.length === 0) {
    return null;
  }

  return join(reportsDir, profileFiles[0]);
}

/**
 * Extract resource requirements from profile data
 */
function extractRequirements(profile: ProfileReport, budget: { min: number; max: number }): ResourceRequirements {
  return {
    peakRAMMB: profile.overall.peakRSSMB,
    avgCPUPercent: profile.overall.avgCPUPercent,
    bandwidthGBPerMonth: profile.overall.estimatedBandwidthMBPerMonth / 1024,
    budget
  };
}

/**
 * Main execution
 */
async function main() {
  const config = parseArgs();

  // Determine profile path
  let profilePath = config.profilePath;
  if (!profilePath) {
    profilePath = findLatestProfile();
    if (!profilePath) {
      console.error('Error: No profile JSON files found in tests/reports/');
      console.error('Run profiling first: npm run profile');
      process.exit(1);
    }
    console.log(`Using latest profile: ${profilePath}`);
  }

  // Verify profile exists
  if (!existsSync(profilePath)) {
    console.error(`Error: Profile file not found: ${profilePath}`);
    process.exit(1);
  }

  // Read profile data
  let profile: ProfileReport;
  try {
    const profileData = readFileSync(profilePath, 'utf-8');
    profile = JSON.parse(profileData);
    console.log(`✓ Loaded profile from ${profilePath}`);
  } catch (err) {
    console.error(`Error reading profile JSON: ${err}`);
    process.exit(1);
  }

  // Inject budget into profile for report generation
  (profile.config as any).budget = { min: config.budgetMin, max: config.budgetMax };

  // Extract resource requirements
  const requirements = extractRequirements(profile, {
    min: config.budgetMin,
    max: config.budgetMax
  });

  console.log('\nResource Requirements:');
  console.log(`  Peak RAM: ${requirements.peakRAMMB.toFixed(1)} MB`);
  console.log(`  Avg CPU: ${requirements.avgCPUPercent.toFixed(1)}%`);
  console.log(`  Bandwidth: ${requirements.bandwidthGBPerMonth.toFixed(2)} GB/month`);
  console.log(`  Budget: $${requirements.budget.min}-$${requirements.budget.max}/month`);

  // Run cost analysis
  const costAnalysis = compareHosting(requirements);
  console.log(`\n✓ Analyzed ${costAnalysis.options.length} hosting options`);
  console.log(`  ${costAnalysis.withinBudget.length} within budget`);

  if (costAnalysis.recommendation) {
    console.log(`\nRecommendation: ${costAnalysis.recommendation.platform} ${costAnalysis.recommendation.tier}`);
    console.log(`  Cost: $${costAnalysis.recommendation.monthlyCost.toFixed(2)}/month`);
    console.log(`  Headroom: ${costAnalysis.recommendation.headroom2x.toFixed(0)}%`);
  } else {
    console.log('\n⚠ No suitable hosting option found within constraints');
  }

  // Generate markdown report
  const markdown = generateReport(profile, costAnalysis);

  // Write report to file
  const timestamp = new Date().toISOString().split('T')[0];
  const reportPath = join(process.cwd(), 'tests', 'reports', `hosting-analysis-${timestamp}.md`);

  try {
    writeFileSync(reportPath, markdown, 'utf-8');
    console.log(`\n✓ Report generated: ${reportPath}`);
  } catch (err) {
    console.error(`Error writing report: ${err}`);
    process.exit(1);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('HOSTING ANALYSIS COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nReport: ${reportPath}`);

  if (costAnalysis.recommendation) {
    const rec = costAnalysis.recommendation;
    const savings = (25 - rec.monthlyCost) * 12;
    console.log(`\nRecommended Platform: ${rec.platform} ${rec.tier}`);
    console.log(`Monthly Cost: $${rec.monthlyCost.toFixed(2)} (vs $25.00 on Replit)`);
    console.log(`Annual Savings: $${savings.toFixed(2)}`);
  }

  console.log('\nNext steps:');
  console.log('  1. Review the full report for migration instructions');
  console.log('  2. Address any performance bottlenecks identified');
  console.log('  3. Set up database on Neon PostgreSQL (free tier)');
  console.log('  4. Follow the migration path in the report');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
