#!/usr/bin/env node
/**
 * run-profile.ts - Profiling orchestrator for ScrumQuest resource measurement
 *
 * Runs load tests against the server and measures actual resource usage
 * to support hosting infrastructure decisions.
 *
 * Usage:
 *   npx tsx tests/profiling/run-profile.ts --users 50 --duration 60
 */

import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { MetricsCollector, ProfilingResults } from "./metrics-collector";

/**
 * Configuration for profiling run
 */
export interface ProfileConfig {
  users: number;
  duration: number;
  serverUrl: string;
}

/**
 * Bottleneck detected during profiling
 */
export interface Bottleneck {
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
}

/**
 * Complete profiling report with all scenarios
 */
export interface ProfileReport {
  timestamp: string; // ISO date
  config: ProfileConfig;
  scenarios: {
    coldStart: ProfilingResults;
    steadyState: ProfilingResults;
    teardown: ProfilingResults;
  };
  overall: {
    peakRSSMB: number; // max across all scenarios
    peakHeapMB: number; // max across all scenarios
    peakCPUPercent: number; // max across all scenarios
    avgCPUPercent: number; // weighted avg (steady state dominates)
    eventLoopUtilization: number; // steady state value
    estimatedBandwidthMBPerMonth: number; // extrapolated from steady state
    bottlenecks: Array<Bottleneck>;
  };
}

/**
 * Parse CLI arguments
 */
function parseArgs(): ProfileConfig {
  const args = process.argv.slice(2);
  const config: ProfileConfig = {
    users: 50,
    duration: 60,
    serverUrl: "http://localhost:5000",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--users" && args[i + 1]) {
      config.users = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--duration" && args[i + 1]) {
      config.duration = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--server-url" && args[i + 1]) {
      config.serverUrl = args[i + 1];
      i++;
    }
  }

  return config;
}

/**
 * Verify server is reachable and ready
 */
async function verifyServer(serverUrl: string): Promise<void> {
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${serverUrl}/api/health/livez`);
      if (response.ok) {
        console.log(`✓ Server ready at ${serverUrl}`);
        return;
      }
    } catch (_err) {
      if (i < maxRetries - 1) {
        console.log(`Server not ready, retrying in ${retryDelay}ms...`);
        await sleep(retryDelay);
      }
    }
  }

  throw new Error(`Server not reachable at ${serverUrl}/api/health/livez after ${maxRetries} attempts`);
}

/**
 * Run k6 load test
 */
async function runK6(users: number, durationSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--vus",
      users.toString(),
      "--duration",
      `${durationSeconds}s`,
      "tests/load/websocket/game-flow.test.js",
    ];

    console.log(`  Running: k6 ${args.join(" ")}`);

    const k6Process = spawn("k6", args, {
      cwd: process.cwd(),
      stdio: "inherit", // Pipe stdout/stderr to console
    });

    k6Process.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("k6 not installed. Install from https://k6.io/docs/getting-started/installation/"));
      } else {
        reject(err);
      }
    });

    k6Process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`k6 exited with code ${code}`));
      }
    });
  });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run cold start scenario
 */
async function runColdStartScenario(config: ProfileConfig): Promise<ProfilingResults> {
  console.log("\n━━━ Scenario A: Cold Start ━━━");
  console.log("Measuring connection storm (10s burst)...");

  const collector = new MetricsCollector(config.serverUrl);
  collector.start();

  await runK6(config.users, 10);

  const results = await collector.stop();
  console.log(`✓ Cold start complete: Peak RSS ${results.peakRSSMB.toFixed(1)}MB, Peak CPU ${results.peakCPUPercent.toFixed(1)}%`);

  return results;
}

/**
 * Run steady state scenario
 */
async function runSteadyStateScenario(config: ProfileConfig): Promise<ProfilingResults> {
  console.log("\n━━━ Scenario B: Steady State ━━━");
  console.log(`Measuring sustained load (${config.duration}s with ${config.users} users)...`);

  console.log("Waiting 5s for server to stabilize...");
  await sleep(5000);

  const collector = new MetricsCollector(config.serverUrl);
  collector.start();

  await runK6(config.users, config.duration);

  const results = await collector.stop();
  console.log(`✓ Steady state complete: Peak RSS ${results.peakRSSMB.toFixed(1)}MB, Avg CPU ${results.avgCPUPercent.toFixed(1)}%`);

  return results;
}

/**
 * Run teardown scenario
 */
async function runTeardownScenario(config: ProfileConfig): Promise<ProfilingResults> {
  console.log("\n━━━ Scenario C: Teardown ━━━");
  console.log("Measuring cleanup (10s monitoring period)...");

  const collector = new MetricsCollector(config.serverUrl);
  collector.start();

  // Just monitor server metrics as connections drain
  await sleep(10000);

  const results = await collector.stop();
  console.log(`✓ Teardown complete: RSS ${results.peakRSSMB.toFixed(1)}MB, CPU ${results.avgCPUPercent.toFixed(1)}%`);

  return results;
}

/**
 * Detect bottlenecks from profiling results
 */
function detectBottlenecks(scenarios: {
  coldStart: ProfilingResults;
  steadyState: ProfilingResults;
  teardown: ProfilingResults;
}): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const { coldStart, steadyState } = scenarios;

  const peakRSS = Math.max(coldStart.peakRSSMB, steadyState.peakRSSMB);
  const peakCPU = Math.max(coldStart.peakCPUPercent, steadyState.peakCPUPercent);

  // Memory bottleneck
  if (peakRSS > 400) {
    bottlenecks.push({
      type: "memory",
      description: `Peak RSS ${peakRSS.toFixed(1)}MB exceeds 400MB — may exceed 512MB tier limits`,
      severity: "high",
    });
  }

  // CPU bottleneck
  if (peakCPU > 80) {
    bottlenecks.push({
      type: "cpu",
      description: `CPU peaks above ${peakCPU.toFixed(1)}% — risk of degraded responsiveness`,
      severity: "high",
    });
  }

  // Event loop utilization
  if (steadyState.eventLoopUtilization > 0.7) {
    bottlenecks.push({
      type: "event-loop",
      description: `Event loop ${(steadyState.eventLoopUtilization * 100).toFixed(1)}% utilized — blocking risk under higher load`,
      severity: "medium",
    });
  }

  // Event loop blocking
  if (steadyState.eventLoopBlockingDetected || coldStart.eventLoopBlockingDetected) {
    bottlenecks.push({
      type: "event-loop-blocking",
      description: "Event loop blocking detected (>90% utilization) — investigate synchronous operations",
      severity: "high",
    });
  }

  // Cold start spike
  if (coldStart.peakRSSMB > steadyState.peakRSSMB * 1.5) {
    bottlenecks.push({
      type: "cold-start",
      description: `Cold start RAM spike ${((coldStart.peakRSSMB / steadyState.peakRSSMB - 1) * 100).toFixed(0)}% above steady state — connection storm vulnerable`,
      severity: "medium",
    });
  }

  return bottlenecks;
}

/**
 * Calculate bandwidth extrapolation for one month
 */
function calculateMonthlyBandwidth(steadyState: ProfilingResults): number {
  const durationSeconds = steadyState.durationMs / 1000;
  const bandwidthPerSecond = steadyState.estimatedBandwidthMB / durationSeconds;

  // Extrapolate to monthly: 730 hours/month
  const bandwidthPerMonth = bandwidthPerSecond * 3600 * 730;

  // Scale by assumed usage: 10% uptime with active users
  return bandwidthPerMonth * 0.1;
}

/**
 * Create overall metrics summary
 */
function createOverallSummary(scenarios: {
  coldStart: ProfilingResults;
  steadyState: ProfilingResults;
  teardown: ProfilingResults;
}): ProfileReport["overall"] {
  const { coldStart, steadyState, teardown } = scenarios;

  const peakRSSMB = Math.max(coldStart.peakRSSMB, steadyState.peakRSSMB, teardown.peakRSSMB);
  const peakHeapMB = Math.max(coldStart.peakHeapMB, steadyState.peakHeapMB, teardown.peakHeapMB);
  const peakCPUPercent = Math.max(coldStart.peakCPUPercent, steadyState.peakCPUPercent, teardown.peakCPUPercent);

  // Weighted average CPU (steady state dominates)
  const totalDuration = coldStart.durationMs + steadyState.durationMs + teardown.durationMs;
  const avgCPUPercent =
    (coldStart.avgCPUPercent * coldStart.durationMs +
      steadyState.avgCPUPercent * steadyState.durationMs +
      teardown.avgCPUPercent * teardown.durationMs) /
    totalDuration;

  const eventLoopUtilization = steadyState.eventLoopUtilization;
  const estimatedBandwidthMBPerMonth = calculateMonthlyBandwidth(steadyState);

  const bottlenecks = detectBottlenecks(scenarios);

  return {
    peakRSSMB,
    peakHeapMB,
    peakCPUPercent,
    avgCPUPercent,
    eventLoopUtilization,
    estimatedBandwidthMBPerMonth,
    bottlenecks,
  };
}

/**
 * Write JSON report to disk
 */
function writeReport(report: ProfileReport): string {
  mkdirSync("tests/reports", { recursive: true });

  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const filename = `tests/reports/profile-${timestamp}.json`;

  writeFileSync(filename, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n📊 Report written to: ${filename}`);

  return filename;
}

/**
 * Print summary to stdout
 */
function printSummary(report: ProfileReport): void {
  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│           PROFILING SUMMARY                     │");
  console.log("└─────────────────────────────────────────────────┘");
  console.log(`\nConfig: ${report.config.users} users, ${report.config.duration}s duration`);
  console.log(`\nOverall Metrics:`);
  console.log(`  Peak RSS:        ${report.overall.peakRSSMB.toFixed(1)} MB`);
  console.log(`  Peak Heap:       ${report.overall.peakHeapMB.toFixed(1)} MB`);
  console.log(`  Peak CPU:        ${report.overall.peakCPUPercent.toFixed(1)}%`);
  console.log(`  Avg CPU:         ${report.overall.avgCPUPercent.toFixed(1)}%`);
  console.log(`  Event Loop:      ${(report.overall.eventLoopUtilization * 100).toFixed(1)}%`);
  console.log(`  Bandwidth/month: ${report.overall.estimatedBandwidthMBPerMonth.toFixed(1)} MB`);

  if (report.overall.bottlenecks.length > 0) {
    console.log(`\n⚠️  Bottlenecks Detected:`);
    report.overall.bottlenecks.forEach((b) => {
      const icon = b.severity === "high" ? "🔴" : b.severity === "medium" ? "🟡" : "🟢";
      console.log(`  ${icon} [${b.severity.toUpperCase()}] ${b.type}: ${b.description}`);
    });
  } else {
    console.log(`\n✅ No bottlenecks detected`);
  }

  console.log("\n");
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ScrumQuest Resource Profiler");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const config = parseArgs();
  console.log(`\nConfiguration:`);
  console.log(`  Users:      ${config.users}`);
  console.log(`  Duration:   ${config.duration}s`);
  console.log(`  Server URL: ${config.serverUrl}`);

  // Verify server is ready
  await verifyServer(config.serverUrl);

  // Run all scenarios
  const coldStart = await runColdStartScenario(config);
  const steadyState = await runSteadyStateScenario(config);
  const teardown = await runTeardownScenario(config);

  // Create report
  const report: ProfileReport = {
    timestamp: new Date().toISOString(),
    config,
    scenarios: {
      coldStart,
      steadyState,
      teardown,
    },
    overall: createOverallSummary({ coldStart, steadyState, teardown }),
  };

  // Write and display results
  writeReport(report);
  printSummary(report);
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("\n❌ Profiling failed:", err.message);
    process.exit(1);
  });
}
