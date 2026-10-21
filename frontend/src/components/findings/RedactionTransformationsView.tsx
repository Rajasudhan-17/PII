import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { DocumentItem } from '../../types/document';
import { OutputArtifact, TransformationRun } from '../../types/transformation';
import { useAuth } from '../../context/AuthContext';
import { RefreshCw, Lock, Copy, Download } from 'lucide-react';
import { documentsApi } from '../../api/documents.api';

interface RedactionTransformationsViewProps {
  document: DocumentItem | null;
  outputArtifact: OutputArtifact | null;
  transformationRun: TransformationRun | null;
  isTransforming: boolean;
  onExecuteTransformation: () => void;
}

export const RedactionTransformationsView: React.FC<RedactionTransformationsViewProps> = ({
  document: doc,
  outputArtifact,
  transformationRun,
  isTransforming,
  onExecuteTransformation,
}) => {
  const { hasPermission } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadRedacted = async () => {
    if (!doc?.organizationId || !doc?.id) return;
    if (!outputArtifact || outputArtifact.status !== 'ACTIVE') {
      setDownloadError(
        outputArtifact?.status === 'PENDING_REVIEW'
          ? 'The redacted output artifact is pending human review and cannot be downloaded.'
          : 'A verified redacted output artifact is not currently available for download.'
      );
      return;
    }
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await documentsApi.downloadTransformedDocument(
        doc.organizationId,
        doc.id,
        outputArtifact.originalFilename || `redacted_${doc.originalFilename}`,
        {
          runId: transformationRun?.transformationRunId,
          outputArtifactId: outputArtifact.outputArtifactId,
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download redacted document';
      setDownloadError(msg);
      console.error('Failed to download redacted document', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Transformation Principle Alert */}
      <Alert variant="info" title="Cryptographic Immutability Notice">
        The Intelligent PII Platform maintains strict separation between source documents and
        redacted outputs. The original document is <strong>permanently immutable</strong> in tenant
        storage. Physical redactions are performed by generating a separate transformed artifact with
        its own cryptographic SHA-256 signature.
      </Alert>

      {downloadError && (
        <Alert variant="critical" title="Download Failed">
          {downloadError}
        </Alert>
      )}

      {/* Side-by-Side Artifact Provenance Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Original File */}
        <Card className="border-l-4 border-l-brand-teal">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-teal" />
                Original Source Document
              </CardTitle>
              <Badge variant="teal">IMMUTABLE</Badge>
            </div>
            <CardDescription>
              Unmodified source ingestion record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <span className="text-text-muted block text-[11px]">Filename</span>
              <span className="font-semibold text-text-primary text-sm truncate block">
                {doc?.originalFilename || 'Unknown'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-text-muted block text-[11px]">Original File Size</span>
                <span className="font-medium text-text-primary tabular-nums">
                  {formatFileSize(doc?.size)}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-[11px]">MIME Type</span>
                <span className="font-mono text-text-primary">
                  {doc?.detectedMimeType || doc?.declaredMimeType || 'application/octet-stream'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">SHA-256 Source Checksum</span>
              <span className="font-mono text-[11px] text-text-secondary break-all bg-surface-cool p-1.5 rounded block border border-surface-border">
                {doc?.checksum || 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Right: Transformed Copy */}
        <Card className="border-l-4 border-l-status-success">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Copy className="w-4 h-4 text-status-success" />
                Transformed Output Artifact
              </CardTitle>
              {outputArtifact ? (
                <Badge variant="success">{outputArtifact.status}</Badge>
              ) : (
                <Badge variant="neutral">NOT GENERATED</Badge>
              )}
            </div>
            <CardDescription>
              Physically redacted derivative copy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {outputArtifact ? (
              <>
                <div>
                  <span className="text-text-muted block text-[11px]">Output Artifact ID</span>
                  <span className="font-mono text-xs font-semibold text-brand-deep-teal">
                    {outputArtifact.outputArtifactId}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-text-muted block text-[11px]">Transformed Size</span>
                    <span className="font-medium text-text-primary tabular-nums">
                      {formatFileSize(outputArtifact.fileSize)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[11px]">Output Format</span>
                    <span className="font-mono text-text-primary">
                      {outputArtifact.mimeType}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">SHA-256 Output Checksum</span>
                  <span className="font-mono text-[11px] text-status-success break-all bg-surface-cool p-1.5 rounded block border border-surface-border">
                    {outputArtifact.outputChecksum}
                  </span>
                </div>
                <div className="pt-2 space-y-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={handleDownloadRedacted}
                    disabled={isDownloading || outputArtifact.status !== 'ACTIVE'}
                    isLoading={isDownloading}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download Redacted Document
                  </Button>
                  {outputArtifact.status === 'PENDING_REVIEW' && (
                    <p className="text-[11px] text-amber-700 font-medium text-center">
                      Artifact is pending human review and cannot be downloaded until approved.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 text-center border-2 border-dashed border-surface-border rounded-lg bg-surface-cool/30">
                <p className="text-xs font-semibold text-text-secondary">
                  No output artifact generated yet
                </p>
                <p className="text-[11px] text-text-muted mt-1">
                  Execute transformation pipeline to apply approved redactions.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transformation Pipeline Action Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Physical Transformation Execution</CardTitle>
              <CardDescription>
                Mutate approved REDACT decisions using format-appropriate redaction engines.
              </CardDescription>
            </div>
            {hasPermission('TRANSFORMATION_EXECUTE') && (
              <Button
                variant="primary"
                size="sm"
                onClick={onExecuteTransformation}
                isLoading={isTransforming}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Execute Transformation
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {transformationRun ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded border border-surface-border bg-surface-cool">
                <span className="text-text-muted block text-[11px]">Run Status</span>
                <span className="font-semibold text-text-primary mt-1 block">
                  {transformationRun.status}
                </span>
              </div>
              <div className="p-3 rounded border border-surface-border bg-surface-cool">
                <span className="text-text-muted block text-[11px]">Redacted Count</span>
                <span className="font-bold text-status-critical mt-1 block tabular-nums">
                  {transformationRun.redactedCount ?? (transformationRun as unknown as { transformedCount?: number }).transformedCount ?? 0}
                </span>
              </div>
              <div className="p-3 rounded border border-surface-border bg-surface-cool">
                <span className="text-text-muted block text-[11px]">Masked Count</span>
                <span className="font-bold text-brand-teal mt-1 block tabular-nums">
                  {transformationRun.maskedCount ?? 0}
                </span>
              </div>
              <div className="p-3 rounded border border-surface-border bg-surface-cool">
                <span className="text-text-muted block text-[11px]">Execution Date</span>
                <span className="font-medium text-text-secondary mt-1 block tabular-nums">
                  {new Date(transformationRun.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-secondary italic">
              No transformation runs recorded for this document.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
