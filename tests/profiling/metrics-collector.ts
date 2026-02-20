/**
 * MetricsCollector - Process resource profiling with Prometheus integration
 *
 * Captures memory, CPU, event loop utilization, and WebSocket metrics
 * during load testing to support hosting infrastructure decisions.
 */

import { performance } from "perf_hooks";

/**
 * Single sample of process metrics at a point in time
 */
export interface MetricSample {
  timestamp: number; // Unix epoch ms
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  cpu: {
    userMicros: number;
    systemMicros: number;
    percentSinceLastSample: number; // Calculated from delta
  };
  eventLoop: {
    idle: number; // 0-1
    active: number; // 0-1
    utilization: number; // 0-1
  };
}

/**
 * Snapshot of Prometheus metrics at a point in time
 */
export interface PrometheusSnapshot {
  timestamp: number;
  wsConnections: number;
  wsMessagesSent: number;
  wsMessagesReceived: number;
}

/**
 * Aggregated profiling results after collection completes
 */
export interface ProfilingResults {
  peakRSSMB: number;
  peakHeapMB: number;
  avgHeapMB: number;
  avgCPUPercent: number;
  peakCPUPercent: number;
  eventLoopUtilization: number; // 0-1 average
  eventLoopPeakUtilization: number;
  eventLoopBlockingDetected: boolean; // true if any sample > 0.9
  estimatedBandwidthMB: number;
  wsConnectionsPeak: number;
  wsMessagesSent: number;
  wsMessagesReceived: number;
  sampleCount: number;
  durationMs: number;
  samples: Array<MetricSample>; // raw data for detailed analysis
}

/**
 * MetricsCollector - Samples process metrics at regular intervals
 *
 * Usage:
 *   const collector = new MetricsCollector();
 *   collector.start();
 *   // ... run load test ...
 *   const results = await collector.stop();
 */
export class MetricsCollector {
  private serverUrl: string;
  private intervalHandle: NodeJS.Timeout | null = null;
  private samples: MetricSample[] = [];
  private startTime: number = 0;
  private lastCpuUsage: { user: number; system: number } | null = null;
  private lastSampleTime: number = 0;
  private prometheusStart: PrometheusSnapshot | null = null;
  private prometheusEnd: PrometheusSnapshot | null = null;

  /**
   * @param serverUrl - Base URL of the server (default: http://localhost:5000)
   */
  constructor(serverUrl: string = "http://localhost:5000") {
    this.serverUrl = serverUrl;
  }

  /**
   * Start collecting metrics at specified interval
   * @param intervalMs - Sampling interval in milliseconds (default: 1000ms)
   */
  start(intervalMs: number = 1000): void {
    if (this.intervalHandle) {
      throw new Error("MetricsCollector already started");
    }

    this.samples = [];
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
    this.lastSampleTime = this.startTime;

    // Fetch initial Prometheus snapshot
    this.fetchPrometheusMetrics()
      .then((snapshot) => {
        this.prometheusStart = snapshot;
      })
      .catch((err) => {
        // Server may not be ready yet - non-fatal
        console.warn("Failed to fetch initial Prometheus metrics:", err.message);
      });

    // Start periodic sampling
    this.intervalHandle = setInterval(() => {
      this.collectSample();
    }, intervalMs);

    // Collect initial sample immediately
    this.collectSample();
  }

  /**
   * Stop collecting metrics and return aggregated results
   */
  async stop(): Promise<ProfilingResults> {
    if (!this.intervalHandle) {
      throw new Error("MetricsCollector not started");
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;

    // Collect final sample
    this.collectSample();

    // Fetch final Prometheus snapshot
    try {
      this.prometheusEnd = await this.fetchPrometheusMetrics();
    } catch (err) {
      console.warn("Failed to fetch final Prometheus metrics:", err);
      // Use start values as fallback
      this.prometheusEnd = this.prometheusStart || {
        timestamp: Date.now(),
        wsConnections: 0,
        wsMessagesSent: 0,
        wsMessagesReceived: 0,
      };
    }

    return this.aggregateResults();
  }

  /**
   * Fetch current Prometheus metrics from /metrics endpoint
   */
  async fetchPrometheusMetrics(): Promise<PrometheusSnapshot> {
    const response = await fetch(`${this.serverUrl}/metrics`);
    if (!response.ok) {
      throw new Error(`Prometheus metrics fetch failed: ${response.status}`);
    }

    const text = await response.text();
    const snapshot: PrometheusSnapshot = {
      timestamp: Date.now(),
      wsConnections: this.parsePrometheusGauge(text, "scrumquest_websocket_connections"),
      wsMessagesSent: this.parsePrometheusCounter(text, "scrumquest_websocket_messages_sent_total"),
      wsMessagesReceived: this.parsePrometheusCounter(text, "scrumquest_websocket_messages_received_total"),
    };

    return snapshot;
  }

  /**
   * Parse Prometheus gauge value (current value)
   */
  private parsePrometheusGauge(metricsText: string, metricName: string): number {
    const regex = new RegExp(`^${metricName}\\{[^}]*\\}\\s+(\\d+\\.?\\d*)`, "m");
    const simpleRegex = new RegExp(`^${metricName}\\s+(\\d+\\.?\\d*)`, "m");

    let match = metricsText.match(regex);
    if (!match) {
      match = metricsText.match(simpleRegex);
    }

    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Parse Prometheus counter value (sum all labels)
   */
  private parsePrometheusCounter(metricsText: string, metricName: string): number {
    const regex = new RegExp(`^${metricName}\\{[^}]*\\}\\s+(\\d+\\.?\\d*)`, "gm");
    const simpleRegex = new RegExp(`^${metricName}\\s+(\\d+\\.?\\d*)`, "m");

    let sum = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(metricsText)) !== null) {
      sum += parseFloat(match[1]);
    }

    if (sum > 0) {
      return sum;
    }

    const simpleMatch = metricsText.match(simpleRegex);
    return simpleMatch ? parseFloat(simpleMatch[1]) : 0;
  }

  /**
   * Collect a single metric sample
   */
  private collectSample(): void {
    const now = Date.now();
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const elu = performance.eventLoopUtilization();

    // Calculate CPU percentage since last sample
    let cpuPercent = 0;
    if (this.lastCpuUsage && this.lastSampleTime) {
      const elapsedMs = now - this.lastSampleTime;
      const userDelta = cpu.user - this.lastCpuUsage.user;
      const systemDelta = cpu.system - this.lastCpuUsage.system;

      // Convert microseconds to percentage of wall clock time
      // Formula: ((userDelta + systemDelta) / (elapsedMs * 1000)) * 100
      cpuPercent = ((userDelta + systemDelta) / (elapsedMs * 1000)) * 100;
    }

    const sample: MetricSample = {
      timestamp: now,
      memory: {
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        heapTotalMB: mem.heapTotal / 1024 / 1024,
        rssMB: mem.rss / 1024 / 1024,
        externalMB: mem.external / 1024 / 1024,
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system,
        percentSinceLastSample: cpuPercent,
      },
      eventLoop: {
        idle: elu.idle,
        active: elu.active,
        utilization: elu.utilization,
      },
    };

    this.samples.push(sample);
    this.lastCpuUsage = cpu;
    this.lastSampleTime = now;
  }

  /**
   * Aggregate samples into profiling results
   */
  private aggregateResults(): ProfilingResults {
    if (this.samples.length === 0) {
      throw new Error("No samples collected");
    }

    const peakRSSMB = Math.max(...this.samples.map((s) => s.memory.rssMB));
    const peakHeapMB = Math.max(...this.samples.map((s) => s.memory.heapUsedMB));
    const avgHeapMB = this.samples.reduce((sum, s) => sum + s.memory.heapUsedMB, 0) / this.samples.length;

    // CPU calculations (skip first sample which has 0% due to no baseline)
    const cpuSamples = this.samples.slice(1).map((s) => s.cpu.percentSinceLastSample);
    const avgCPUPercent = cpuSamples.length > 0 ? cpuSamples.reduce((sum, v) => sum + v, 0) / cpuSamples.length : 0;
    const peakCPUPercent = cpuSamples.length > 0 ? Math.max(...cpuSamples) : 0;

    // Event loop utilization
    const eluValues = this.samples.map((s) => s.eventLoop.utilization);
    const eventLoopUtilization = eluValues.reduce((sum, v) => sum + v, 0) / eluValues.length;
    const eventLoopPeakUtilization = Math.max(...eluValues);
    const eventLoopBlockingDetected = eluValues.some((v) => v > 0.9);

    // Bandwidth estimation from Prometheus metrics
    const messagesSent = (this.prometheusEnd?.wsMessagesSent || 0) - (this.prometheusStart?.wsMessagesSent || 0);
    const messagesReceived = (this.prometheusEnd?.wsMessagesReceived || 0) - (this.prometheusStart?.wsMessagesReceived || 0);
    const totalMessages = messagesSent + messagesReceived;
    const estimatedBandwidthMB = (totalMessages * 500 * 1.3) / 1024 / 1024; // 500 bytes avg * 1.3 safety margin

    const wsConnectionsPeak = Math.max(
      this.prometheusStart?.wsConnections || 0,
      this.prometheusEnd?.wsConnections || 0
    );

    const durationMs = Date.now() - this.startTime;

    return {
      peakRSSMB,
      peakHeapMB,
      avgHeapMB,
      avgCPUPercent,
      peakCPUPercent,
      eventLoopUtilization,
      eventLoopPeakUtilization,
      eventLoopBlockingDetected,
      estimatedBandwidthMB,
      wsConnectionsPeak,
      wsMessagesSent: messagesSent,
      wsMessagesReceived: messagesReceived,
      sampleCount: this.samples.length,
      durationMs,
      samples: this.samples,
    };
  }
}
