import mongoose from 'mongoose';

export type PdfErrorCategory =
  | 'BROWSER_LAUNCH_ERROR'
  | 'NETWORK_UNREACHABLE'
  | 'TIMEOUT'
  | 'RENDER_CRASH'
  | 'UNKNOWN_ERROR';

export type AiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH'
  | 'AI_BUSY'
  | 'AI_UNREACHABLE'
  | 'AI_FORMAT'
  | 'AI_ERROR';

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

export interface TrackedError {
  timestamp: string;
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  message: string;
  category?: string;
}

export interface Alert {
  id: string;
  level: 'warning' | 'critical';
  title: string;
  message: string;
  value: number | string;
  threshold: number | string;
  timestamp: string;
}

/**
 * Helper to compute percentile and summary statistics from an array of numbers.
 */
export function calculateLatencyStats(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round((sum / count) * 10) / 10;

  const p50Index = Math.min(Math.floor(0.5 * count), count - 1);
  const p95Index = Math.min(Math.floor(0.95 * count), count - 1);

  return {
    count,
    min,
    max,
    avg,
    p50: sorted[p50Index],
    p95: sorted[p95Index],
  };
}

/**
 * Categorizes raw errors encountered during PDF rendering into structured categories.
 */
export function categorizePdfError(err: unknown): PdfErrorCategory {
  const text = err instanceof Error ? err.message : String(err);
  if (/Executable doesn't exist|browserType\.launch|Failed to launch|spawn .* ENOENT/i.test(text)) {
    return 'BROWSER_LAUNCH_ERROR';
  }
  if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|net::ERR|fetch failed/i.test(text)) {
    return 'NETWORK_UNREACHABLE';
  }
  if (/Timeout|timed out|navigation timeout/i.test(text)) {
    return 'TIMEOUT';
  }
  if (/crash|target closed|protocol error|session closed/i.test(text)) {
    return 'RENDER_CRASH';
  }
  return 'UNKNOWN_ERROR';
}

class MetricsRegistry {
  // API Requests
  private totalRequests = 0;
  private status2xx = 0;
  private status3xx = 0;
  private status4xx = 0;
  private status5xx = 0;
  private overallLatencies: number[] = [];
  private endpointLatencies: Map<string, number[]> = new Map();
  private endpointCounts: Map<string, { requests: number; errors: number }> = new Map();

  // PDF Generation
  private pdfTotal = 0;
  private pdfActive = 0;
  private pdfSuccess = 0;
  private pdfFailure = 0;
  private pdfLatencies: number[] = [];
  private pdfFailuresByCategory: Record<PdfErrorCategory, number> = {
    BROWSER_LAUNCH_ERROR: 0,
    NETWORK_UNREACHABLE: 0,
    TIMEOUT: 0,
    RENDER_CRASH: 0,
    UNKNOWN_ERROR: 0,
  };

  // AI Service
  private aiTotal = 0;
  private aiActive = 0;
  private aiSuccess = 0;
  private aiFailure = 0;
  private aiLatencies: number[] = [];
  private aiFailuresByCode: Record<AiErrorCode, number> = {
    AI_NOT_CONFIGURED: 0,
    AI_AUTH: 0,
    AI_BUSY: 0,
    AI_UNREACHABLE: 0,
    AI_FORMAT: 0,
    AI_ERROR: 0,
  };

  // Error tracking ring buffer
  private recentErrors: TrackedError[] = [];
  private readonly MAX_ERRORS = 50;
  private readonly MAX_LATENCY_SAMPLES = 500;
  private readonly MAX_ENDPOINT_SAMPLES = 200;

  // --- API Latency & Requests ---
  recordApiRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    this.totalRequests++;

    if (statusCode >= 200 && statusCode < 300) this.status2xx++;
    else if (statusCode >= 300 && statusCode < 400) this.status3xx++;
    else if (statusCode >= 400 && statusCode < 500) this.status4xx++;
    else if (statusCode >= 500) this.status5xx++;

    // Record overall latency sample
    this.overallLatencies.push(durationMs);
    if (this.overallLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.overallLatencies.shift();
    }

    // Normalized endpoint identifier: e.g. "GET /api/resumes"
    const key = `${method.toUpperCase()} ${route}`;
    if (!this.endpointLatencies.has(key)) {
      this.endpointLatencies.set(key, []);
      this.endpointCounts.set(key, { requests: 0, errors: 0 });
    }

    const samples = this.endpointLatencies.get(key)!;
    samples.push(durationMs);
    if (samples.length > this.MAX_ENDPOINT_SAMPLES) {
      samples.shift();
    }

    const counts = this.endpointCounts.get(key)!;
    counts.requests++;
    if (statusCode >= 400) {
      counts.errors++;
    }
  }

  // --- PDF Metrics ---
  recordPdfStart(): void {
    this.pdfTotal++;
    this.pdfActive++;
  }

  recordPdfSuccess(durationMs: number): void {
    this.pdfActive = Math.max(0, this.pdfActive - 1);
    this.pdfSuccess++;
    this.pdfLatencies.push(durationMs);
    if (this.pdfLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.pdfLatencies.shift();
    }
  }

  recordPdfFailure(err: unknown, durationMs: number): PdfErrorCategory {
    this.pdfActive = Math.max(0, this.pdfActive - 1);
    this.pdfFailure++;
    this.pdfLatencies.push(durationMs);
    if (this.pdfLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.pdfLatencies.shift();
    }

    const category = categorizePdfError(err);
    this.pdfFailuresByCategory[category]++;
    return category;
  }

  getActivePdfRenders(): number {
    return this.pdfActive;
  }

  // --- AI Metrics ---
  recordAiStart(): void {
    this.aiTotal++;
    this.aiActive++;
  }

  recordAiSuccess(durationMs: number): void {
    this.aiActive = Math.max(0, this.aiActive - 1);
    this.aiSuccess++;
    this.aiLatencies.push(durationMs);
    if (this.aiLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.aiLatencies.shift();
    }
  }

  recordAiFailure(code: string | undefined, durationMs: number): void {
    this.aiActive = Math.max(0, this.aiActive - 1);
    this.aiFailure++;
    this.aiLatencies.push(durationMs);
    if (this.aiLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.aiLatencies.shift();
    }

    const safeCode: AiErrorCode =
      code && code in this.aiFailuresByCode ? (code as AiErrorCode) : 'AI_ERROR';
    this.aiFailuresByCode[safeCode]++;
  }

  // --- Error Tracking ---
  recordError(error: Omit<TrackedError, 'timestamp'>): void {
    const entry: TrackedError = {
      ...error,
      timestamp: new Date().toISOString(),
    };
    this.recentErrors.push(entry);
    if (this.recentErrors.length > this.MAX_ERRORS) {
      this.recentErrors.shift();
    }
  }

  getRecentErrors(limit = 20): TrackedError[] {
    return this.recentErrors.slice(-limit);
  }

  // --- Alerts Evaluation ---
  getAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const timestamp = new Date().toISOString();

    // 1. Database Connectivity
    if (mongoose.connection && mongoose.connection.readyState !== 1) {
      alerts.push({
        id: 'DATABASE_DOWN',
        level: 'critical',
        title: 'Database Disconnected',
        message: 'Mongoose connection is not ready.',
        value: mongoose.connection.readyState,
        threshold: 1,
        timestamp,
      });
    }

    // 2. High 5xx Error Rate
    if (this.totalRequests >= 10) {
      const errorRate5xx = (this.status5xx / this.totalRequests) * 100;
      if (errorRate5xx > 5) {
        alerts.push({
          id: 'HIGH_5XX_ERROR_RATE',
          level: 'critical',
          title: 'High Server 5xx Error Rate',
          message: `Server 5xx error rate is currently ${errorRate5xx.toFixed(1)}%.`,
          value: `${errorRate5xx.toFixed(1)}%`,
          threshold: '5%',
          timestamp,
        });
      }
    }

    // 3. High API p95 Latency
    if (this.overallLatencies.length >= 10) {
      const { p95 } = calculateLatencyStats(this.overallLatencies);
      if (p95 > 2000) {
        alerts.push({
          id: 'HIGH_API_LATENCY',
          level: 'warning',
          title: 'High API p95 Latency',
          message: `API p95 latency is ${p95}ms, exceeding the 2000ms threshold.`,
          value: `${p95}ms`,
          threshold: '2000ms',
          timestamp,
        });
      }
    }

    // 4. PDF Generation Failure Rate
    if (this.pdfTotal >= 4) {
      const pdfFailureRate = (this.pdfFailure / this.pdfTotal) * 100;
      if (pdfFailureRate > 25) {
        alerts.push({
          id: 'PDF_FAILURE_SPIKE',
          level: 'warning',
          title: 'High PDF Generation Failure Rate',
          message: `PDF export failure rate is ${pdfFailureRate.toFixed(1)}%.`,
          value: `${pdfFailureRate.toFixed(1)}%`,
          threshold: '25%',
          timestamp,
        });
      }
    }

    // 5. AI Service Failure Rate
    if (this.aiTotal >= 5) {
      const aiFailureRate = (this.aiFailure / this.aiTotal) * 100;
      if (aiFailureRate > 30) {
        alerts.push({
          id: 'AI_FAILURE_SPIKE',
          level: 'warning',
          title: 'High AI Failure Rate',
          message: `AI service failure rate is ${aiFailureRate.toFixed(1)}%.`,
          value: `${aiFailureRate.toFixed(1)}%`,
          threshold: '30%',
          timestamp,
        });
      }
    }

    // 6. Memory Pressure Alert
    const mem = process.memoryUsage();
    if (mem.heapTotal > 0) {
      const heapUsedRatio = mem.heapUsed / mem.heapTotal;
      if (heapUsedRatio > 0.88) {
        alerts.push({
          id: 'HIGH_MEMORY_PRESSURE',
          level: 'warning',
          title: 'High Memory Pressure',
          message: `Node.js heap usage is at ${Math.round(heapUsedRatio * 100)}% of allocated heap.`,
          value: `${Math.round(heapUsedRatio * 100)}%`,
          threshold: '88%',
          timestamp,
        });
      }
    }

    return alerts;
  }

  // --- Metrics Summary Export ---
  getMetricsSummary() {
    const errorCount = this.status4xx + this.status5xx;
    const total = this.totalRequests;
    const errorRate = total > 0 ? Math.round((errorCount / total) * 1000) / 10 : 0;
    const serverErrorRate = total > 0 ? Math.round((this.status5xx / total) * 1000) / 10 : 0;

    const overallLatencyStats = calculateLatencyStats(this.overallLatencies);
    const pdfLatencyStats = calculateLatencyStats(this.pdfLatencies);
    const aiLatencyStats = calculateLatencyStats(this.aiLatencies);

    // Key endpoints breakdown
    const endpoints: Record<string, { requests: number; errors: number; latency: LatencyStats }> =
      {};
    for (const [key, samples] of this.endpointLatencies.entries()) {
      const counts = this.endpointCounts.get(key) ?? { requests: 0, errors: 0 };
      endpoints[key] = {
        requests: counts.requests,
        errors: counts.errors,
        latency: calculateLatencyStats(samples),
      };
    }

    return {
      timestamp: new Date().toISOString(),
      api: {
        totalRequests: this.totalRequests,
        statusCodes: {
          '2xx': this.status2xx,
          '3xx': this.status3xx,
          '4xx': this.status4xx,
          '5xx': this.status5xx,
        },
        errorRatePercent: errorRate,
        serverErrorRatePercent: serverErrorRate,
        latencyMs: overallLatencyStats,
        endpoints,
      },
      pdf: {
        total: this.pdfTotal,
        active: this.pdfActive,
        success: this.pdfSuccess,
        failure: this.pdfFailure,
        failureRatePercent:
          this.pdfTotal > 0
            ? Math.round((this.pdfFailure / this.pdfTotal) * 1000) / 10
            : 0,
        latencyMs: pdfLatencyStats,
        failuresByCategory: { ...this.pdfFailuresByCategory },
      },
      ai: {
        total: this.aiTotal,
        active: this.aiActive,
        success: this.aiSuccess,
        failure: this.aiFailure,
        failureRatePercent:
          this.aiTotal > 0 ? Math.round((this.aiFailure / this.aiTotal) * 1000) / 10 : 0,
        latencyMs: aiLatencyStats,
        failuresByCode: { ...this.aiFailuresByCode },
      },
      alerts: this.getAlerts(),
      recentErrors: this.getRecentErrors(10),
    };
  }

  // --- Reset (for test isolation) ---
  reset(): void {
    this.totalRequests = 0;
    this.status2xx = 0;
    this.status3xx = 0;
    this.status4xx = 0;
    this.status5xx = 0;
    this.overallLatencies = [];
    this.endpointLatencies.clear();
    this.endpointCounts.clear();

    this.pdfTotal = 0;
    this.pdfActive = 0;
    this.pdfSuccess = 0;
    this.pdfFailure = 0;
    this.pdfLatencies = [];
    this.pdfFailuresByCategory = {
      BROWSER_LAUNCH_ERROR: 0,
      NETWORK_UNREACHABLE: 0,
      TIMEOUT: 0,
      RENDER_CRASH: 0,
      UNKNOWN_ERROR: 0,
    };

    this.aiTotal = 0;
    this.aiActive = 0;
    this.aiSuccess = 0;
    this.aiFailure = 0;
    this.aiLatencies = [];
    this.aiFailuresByCode = {
      AI_NOT_CONFIGURED: 0,
      AI_AUTH: 0,
      AI_BUSY: 0,
      AI_UNREACHABLE: 0,
      AI_FORMAT: 0,
      AI_ERROR: 0,
    };

    this.recentErrors = [];
  }
}

export const metrics = new MetricsRegistry();
