import { logger } from './logger';

export interface MetricEntry {
  name: string;
  count: number;
  totalDurationMs?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  labels?: Record<string, string>;
}

export class MetricsCollector {
  private counters = new Map<string, number>();
  private timings = new Map<
    string,
    { count: number; totalDurationMs: number; minDurationMs: number; maxDurationMs: number }
  >();

  /**
   * Increments a named counter metric with optional sanitized labels.
   * Safety invariant: Labels MUST NOT contain raw PII or sensitive tokens.
   */
  public increment(metricName: string, value = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(metricName, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Records a latency/duration measurement for an operation.
   */
  public recordDuration(metricName: string, durationMs: number, labels?: Record<string, string>): void {
    const key = this.buildKey(metricName, labels);
    const existing = this.timings.get(key);

    if (!existing) {
      this.timings.set(key, {
        count: 1,
        totalDurationMs: durationMs,
        minDurationMs: durationMs,
        maxDurationMs: durationMs,
      });
    } else {
      existing.count += 1;
      existing.totalDurationMs += durationMs;
      existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    }
  }

  /**
   * Returns a complete JSON snapshot of system metrics for observability.
   */
  public getMetricsSnapshot(): {
    timestamp: string;
    uptimeSeconds: number;
    counters: Record<string, number>;
    timings: Record<
      string,
      { count: number; totalMs: number; avgMs: number; minMs: number; maxMs: number }
    >;
  } {
    const countersObj: Record<string, number> = {};
    for (const [k, v] of this.counters.entries()) {
      countersObj[k] = v;
    }

    const timingsObj: Record<
      string,
      { count: number; totalMs: number; avgMs: number; minMs: number; maxMs: number }
    > = {};
    for (const [k, v] of this.timings.entries()) {
      timingsObj[k] = {
        count: v.count,
        totalMs: Math.round(v.totalDurationMs),
        avgMs: v.count > 0 ? Math.round(v.totalDurationMs / v.count) : 0,
        minMs: Math.round(v.minDurationMs),
        maxMs: Math.round(v.maxDurationMs),
      };
    }

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      counters: countersObj,
      timings: timingsObj,
    };
  }

  public reset(): void {
    this.counters.clear();
    this.timings.clear();
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    // Format sanitized labels as key{k1=v1,k2=v2}
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${this.sanitizeLabel(v)}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private sanitizeLabel(val: string): string {
    // Strip control characters, quotes, and truncate length
    return String(val).replace(/[\r\n\t"]/g, '_').slice(0, 64);
  }
}

export const metrics = new MetricsCollector();

export const logMetricEvent = (
  metricName: string,
  data: Record<string, unknown>,
  message?: string
): void => {
  logger.info({ event: 'metric_event', metric: metricName, ...data }, message || `Metric: ${metricName}`);
};
