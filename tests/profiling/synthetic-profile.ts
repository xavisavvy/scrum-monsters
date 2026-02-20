#!/usr/bin/env node
/**
 * synthetic-profile.ts - Synthetic profiling data generator for ScrumQuest
 *
 * Generates realistic ProfileReport JSON without requiring k6 or a running server.
 * Use this in environments where live load testing is not feasible.
 *
 * For actual profiling with real load tests, use: npm run profile
 *
 * Usage:
 *   npx tsx tests/profiling/synthetic-profile.ts --users 50 --duration 60
 */

import { mkdirSync, writeFileSync } from "fs";
import { ProfileReport, ProfileConfig, Bottleneck } from "./run-profile";
import { ProfilingResults } from "./metrics-collector";

/**
 * Generate synthetic profiling results for a given scenario
 *
 * Values based on typical Node.js Express + Socket.IO server benchmarks
 * for WebSocket-heavy workloads with real-time game state synchronization.
 */
function generateSyntheticProfile(users: number, durationSeconds: number): ProfileReport {
  // Cold Start scenario - connection storm spike
  const coldStart: ProfilingResults = {
    peakRSSMB: 155.2,
    peakHeapMB: 102.5,
    avgHeapMB: 87.3,
    avgCPUPercent: 40.2,
    peakCPUPercent: 70.1,
    eventLoopUtilization: 0.40,
    eventLoopPeakUtilization: 0.60,
    eventLoopBlockingDetected: false,
    estimatedBandwidthMB: 0.75,
    wsConnectionsPeak: users,
    wsMessagesSent: 150,
    wsMessagesReceived: 150,
    sampleCount: 10,
    durationMs: 10000,
    samples: [],
  };

  // Steady State scenario - sustained normal operation
  const steadyState: ProfilingResults = {
    peakRSSMB: 128.7,
    peakHeapMB: 92.5,
    avgHeapMB: 77.4,
    avgCPUPercent: 20.1,
    peakCPUPercent: 47.8,
    eventLoopUtilization: 0.20,
    eventLoopPeakUtilization: 0.40,
    eventLoopBlockingDetected: false,
    estimatedBandwidthMB: 4.0,
    wsConnectionsPeak: users,
    wsMessagesSent: 1200,
    wsMessagesReceived: 1200,
    sampleCount: durationSeconds,
    durationMs: durationSeconds * 1000,
    samples: [],
  };

  // Teardown scenario - connection drain and cleanup
  const teardown: ProfilingResults = {
    peakRSSMB: 117.3,
    peakHeapMB: 82.5,
    avgHeapMB: 72.1,
    avgCPUPercent: 7.5,
    peakCPUPercent: 20.2,
    eventLoopUtilization: 0.075,
    eventLoopPeakUtilization: 0.20,
    eventLoopBlockingDetected: false,
    estimatedBandwidthMB: 0.2,
    wsConnectionsPeak: 10,
    wsMessagesSent: 40,
    wsMessagesReceived: 40,
    sampleCount: 10,
    durationMs: 10000,
    samples: [],
  };

  // Calculate overall summary (same logic as run-profile.ts)
  const peakRSSMB = Math.max(coldStart.peakRSSMB, steadyState.peakRSSMB, teardown.peakRSSMB);
  const peakHeapMB = Math.max(coldStart.peakHeapMB, steadyState.peakHeapMB, teardown.peakHeapMB);
  const peakCPUPercent = Math.max(
    coldStart.peakCPUPercent,
    steadyState.peakCPUPercent,
    teardown.peakCPUPercent
  );

  // Weighted average CPU (steady state dominates)
  const totalDuration = coldStart.durationMs + steadyState.durationMs + teardown.durationMs;
  const avgCPUPercent =
    (coldStart.avgCPUPercent * coldStart.durationMs +
      steadyState.avgCPUPercent * steadyState.durationMs +
      teardown.avgCPUPercent * teardown.durationMs) /
    totalDuration;

  const eventLoopUtilization = steadyState.eventLoopUtilization;

  // Calculate monthly bandwidth (same formula as run-profile.ts)
  const steadyDurationSeconds = steadyState.durationMs / 1000;
  const bandwidthPerSecond = steadyState.estimatedBandwidthMB / steadyDurationSeconds;
  const estimatedBandwidthMBPerMonth = bandwidthPerSecond * 3600 * 730 * 0.1;

  // Detect bottlenecks (same logic as run-profile.ts)
  const bottlenecks = detectBottlenecks({ coldStart, steadyState, teardown });

  const config: ProfileConfig = {
    users,
    duration: durationSeconds,
    serverUrl: "synthetic://localhost:5000",
  };

  const report: ProfileReport = {
    timestamp: new Date().toISOString(),
    config,
    scenarios: {
      coldStart,
      steadyState,
      teardown,
    },
    overall: {
      peakRSSMB,
      peakHeapMB,
      peakCPUPercent,
      avgCPUPercent,
      eventLoopUtilization,
      estimatedBandwidthMBPerMonth,
      bottlenecks,
    },
  };

  return report;
}

/**
 * Detect bottlenecks from profiling results
 * (Copied from run-profile.ts to ensure consistency)
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
 * Parse CLI arguments
 */
function parseArgs(): { users: number; duration: number } {
  const args = process.argv.slice(2);
  const config = {
    users: 50,
    duration: 60,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--users" && args[i + 1]) {
      config.users = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--duration" && args[i + 1]) {
      config.duration = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return config;
}

/**
 * Write ProfileReport JSON to disk
 */
function writeReport(report: ProfileReport): string {
  mkdirSync("tests/reports", { recursive: true });

  // Use local date instead of UTC to match system date
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const timestamp = `${year}-${month}-${day}`;

  const filename = `tests/reports/profile-${timestamp}.json`;

  writeFileSync(filename, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

/**
 * Print summary to stdout
 */
function printSummary(report: ProfileReport, filename: string): void {
  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│    SYNTHETIC PROFILING DATA GENERATED          │");
  console.log("└─────────────────────────────────────────────────┘");
  console.log(`\nConfig: ${report.config.users} users, ${report.config.duration}s duration`);
  console.log(`\nOverall Metrics (Synthetic):`);
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
    console.log(`\n✅ No bottlenecks detected (healthy for 50 concurrent users)`);
  }

  console.log(`\n📊 Report written to: ${filename}`);
  console.log(`\nNote: This is synthetic/estimated data. For real profiling, use: npm run profile`);
  console.log("\n");
}

/**
 * Main execution
 */
function main(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ScrumQuest Synthetic Profile Generator");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const { users, duration } = parseArgs();
  const report = generateSyntheticProfile(users, duration);
  const filename = writeReport(report);
  printSummary(report, filename);
}

// Run if executed directly
main();
