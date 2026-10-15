import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { systemApi, HealthReport, ReadinessReport, LivenessReport } from '../api/system.api';
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  Database,
  Cpu,
  Clock,
  Shield,
  Server,
  Zap,
} from 'lucide-react';

export const SystemHealthPage: React.FC = () => {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [liveness, setLiveness] = useState<LivenessReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

  const fetchGenerationRef = useRef(0);

  const formatUptime = (seconds?: number): string => {
    if (seconds === undefined || seconds === null) return 'N/A';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const fetchAllProbes = useCallback(async () => {
    const currentGen = ++fetchGenerationRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [healthRes, readinessRes, livenessRes] = await Promise.all([
        systemApi.getHealth().catch((err: Error) => ({
          status: 'error' as const,
          service: 'pii-backend',
          version: 'unknown',
          environment: 'unknown',
          timestamp: new Date().toISOString(),
          uptime: 0,
          dependencies: { mongodb: 'error', redis: 'error' },
          error: err.message,
        })),
        systemApi.getReadiness().catch((err: Error) => ({
          status: 'error' as const,
          service: 'pii-backend',
          version: 'unknown',
          environment: 'unknown',
          timestamp: new Date().toISOString(),
          dependencies: { mongodb: 'error', redis: 'error' },
          error: err.message,
        })),
        systemApi.getLiveness().catch((err: Error) => ({
          status: 'error' as const,
          service: 'pii-backend',
          timestamp: new Date().toISOString(),
          error: err.message,
        })),
      ]);

      if (currentGen !== fetchGenerationRef.current) return;

      setHealth(healthRes as HealthReport);
      setReadiness(readinessRes as ReadinessReport);
      setLiveness(livenessRes as LivenessReport);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      if (currentGen !== fetchGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to reach system health probes.');
    } finally {
      if (currentGen === fetchGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAllProbes();
  }, [fetchAllProbes]);

  // Periodic Auto-refresh Timer
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      fetchAllProbes();
    }, 30000);

    return () => clearInterval(interval);
  }, [isAutoRefresh, fetchAllProbes]);

  const isLivenessOk = liveness?.status === 'ok';
  const isReadinessOk = readiness?.status === 'ready';
  const isOverallHealthy = health?.status === 'ok' && isReadinessOk && isLivenessOk;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operational System Health & Readiness"
        description="Live backend diagnostics, dependency connectivity states, and pipeline hardware/modality capabilities."
        badge={
          <Badge
            variant={isOverallHealthy ? 'success' : 'warning'}
            size="sm"
          >
            {isOverallHealthy ? 'All Systems Operational' : 'Degraded Services'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={isAutoRefresh ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className="text-xs"
            >
              {isAutoRefresh ? 'Auto-Refresh: ON (30s)' : 'Auto-Refresh: OFF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllProbes}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Probe Now
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="critical" title="Health Probe Communication Failure">
          {error}
        </Alert>
      )}

      {/* Distinction Notice Alert */}
      <Alert variant="info" title="Operational Visibility Standards">
        This view reports live results from backend probe routes (<code>/health</code>, <code>/health/readiness</code>, <code>/health/liveness</code>). Liveness verifies the Express process loop is responding; readiness verifies database and Redis connections are established. Service availability is distinct from individual document processing success, and internal secrets, connection strings, and raw customer data are never exposed.
      </Alert>

      {/* Core Probe Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Liveness Probe */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Process Liveness</CardTitle>
              <Zap className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Endpoint: /health/liveness</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !liveness ? (
              <Skeleton className="h-6 w-24" />
            ) : isLivenessOk ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">Alive & Responding</Badge>
                  <span className="text-xs text-text-secondary font-mono">HTTP 200</span>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">
                  Express event loop is responsive and accepting connections.
                </p>
              </div>
            ) : (
              <Badge variant="critical" size="sm">Liveness Failed</Badge>
            )}
          </CardContent>
        </Card>

        {/* Readiness Probe */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Traffic Readiness</CardTitle>
              <Activity className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Endpoint: /health/readiness</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !readiness ? (
              <Skeleton className="h-6 w-24" />
            ) : isReadinessOk ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">Ready for Traffic</Badge>
                  <span className="text-xs text-text-secondary font-mono">Ready</span>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">
                  Required dependencies are connected and accepting workload.
                </p>
              </div>
            ) : (
              <Badge variant="warning" size="sm">Not Ready for Workload</Badge>
            )}
          </CardContent>
        </Card>

        {/* Core Backend Service */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Service Runtime</CardTitle>
              <Server className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Endpoint: /health</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !health ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Uptime:</span>
                  <span className="font-mono font-semibold text-brand-deep-teal">
                    {formatUptime(health?.uptime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Environment:</span>
                  <span className="font-mono text-text-primary capitalize">
                    {health?.environment || 'production'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Version:</span>
                  <span className="font-mono text-text-primary">v{health?.version || '1.0.0'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Infrastructure Dependencies & Modality Bounds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Infrastructure Dependencies */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-4 h-4 text-brand-teal" />
                Infrastructure Dependencies
              </CardTitle>
              <Badge variant="info" size="sm">Explicit Probe</Badge>
            </div>
            <CardDescription>
              Backend connection state to persistent storage and asynchronous queue brokers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-xs">
              {/* MongoDB Status */}
              <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/40 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text-primary flex items-center gap-1.5">
                    MongoDB Database
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Primary multi-tenant document metadata, case ledgers, and policy store.
                  </p>
                </div>
                <Badge
                  variant={health?.dependencies.mongodb === 'connected' ? 'success' : 'critical'}
                  size="sm"
                >
                  {health?.dependencies.mongodb || 'Unknown'}
                </Badge>
              </div>

              {/* Redis Broker Status */}
              <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/40 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text-primary flex items-center gap-1.5">
                    Redis Cache & BullMQ Broker
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    In-memory token blacklists, concurrency lease locks, and queue manager.
                  </p>
                </div>
                <Badge
                  variant={health?.dependencies.redis === 'connected' ? 'success' : 'critical'}
                  size="sm"
                >
                  {health?.dependencies.redis || 'Unknown'}
                </Badge>
              </div>

              {/* Security Boundary Invariant */}
              <div className="p-2.5 rounded bg-surface-white border border-surface-border/80 text-[11px] text-text-secondary flex items-start gap-2">
                <Shield className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
                <span>
                  <strong>Security Invariant:</strong> Database connection strings, credentials, internal IP addresses, and file paths are sanitized and never exposed to the client.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing Engine & Modality Bounds */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-teal" />
                Modality Engine Capabilities & Limits
              </CardTitle>
              <Badge variant="teal" size="sm">Runtime Bounds</Badge>
            </div>
            <CardDescription>
              Document formats, text extractors, OCR models, and payload constraints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">Tesseract OCR Engine</span>
                  <span className="text-[11px] text-text-secondary">Node.js raster text extraction</span>
                </div>
                <Badge variant="success" size="sm">Available</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">TrOCR Handwriting HTR</span>
                  <span className="text-[11px] text-text-secondary">microsoft/trocr-base-handwritten</span>
                </div>
                <Badge variant="warning" size="sm">Offline Weights (HTR_UNAVAILABLE)</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">Speech-to-Text (STT)</span>
                  <span className="text-[11px] text-text-secondary">Audio transcription modality</span>
                </div>
                <Badge variant="info" size="sm">Deterministic Fixture</Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">Ingestion File Size Limit</span>
                  <span className="text-[11px] text-text-secondary">Max single document payload</span>
                </div>
                <span className="font-mono font-semibold text-text-primary">10 MB</span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="font-semibold text-text-primary block">Supported File Formats</span>
                  <span className="text-[11px] text-text-secondary">Magic-byte verified allowlist</span>
                </div>
                <span className="font-mono text-brand-deep-teal font-medium">PDF, DOCX, TXT, XLSX, PPTX, PNG, JPG</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Refreshed Footer Indicator */}
      <div className="p-3 rounded-lg border border-surface-border bg-surface-cool/30 flex items-center justify-between text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Last probe executed:{' '}
            <strong className="text-text-primary">
              {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : 'Never'}
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Active Organization Scope:</span>
          <span className="font-mono font-semibold text-brand-deep-teal">
            {health?.service || 'pii-backend'}
          </span>
        </div>
      </div>
    </div>
  );
};
