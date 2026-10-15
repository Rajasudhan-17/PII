import React, { useEffect, useState, useCallback } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Alert } from '../ui/Alert';
import { Skeleton } from '../ui/Skeleton';
import { documentsApi } from '../../api/documents.api';
import { DocumentItem, ExtractionStatusResult, OCRStatusResult } from '../../types/document';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  FileText,
  Download,
  Trash2,
  Cpu,
  RefreshCw,
  Clock,
  Layers,
  FileCheck,
  AlertTriangle,
  FileSearch,
  SearchCode,
} from 'lucide-react';

interface DocumentDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentItem | null;
  organizationId: string;
  onDocumentUpdated?: (doc: DocumentItem) => void;
  onDocumentDeleted?: (docId: string) => void;
}

export const DocumentDetailsDialog: React.FC<DocumentDetailsDialogProps> = ({
  isOpen,
  onClose,
  document: doc,
  organizationId,
  onDocumentUpdated,
  onDocumentDeleted,
}) => {
  const { hasPermission } = useAuth();
  const [extractionInfo, setExtractionInfo] = useState<ExtractionStatusResult | null>(null);
  const [ocrInfo, setOcrInfo] = useState<OCRStatusResult | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadPipelineMetadata = useCallback(async (docId: string) => {
    setIsLoadingMetadata(true);
    setActionError(null);
    try {
      // 1. Fetch extraction status
      const extRes = await documentsApi.getExtractionStatus(organizationId, docId).catch(() => null);
      if (extRes) setExtractionInfo(extRes);

      // 2. Fetch OCR status if relevant format
      const ocrRes = await documentsApi.getOCRStatus(organizationId, docId).catch(() => null);
      if (ocrRes && ocrRes.data) setOcrInfo(ocrRes.data);
    } finally {
      setIsLoadingMetadata(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (isOpen && doc) {
      loadPipelineMetadata(doc.id);
    } else {
      setExtractionInfo(null);
      setOcrInfo(null);
      setActionError(null);
      setActionSuccess(null);
    }
  }, [isOpen, doc, loadPipelineMetadata]);

  if (!doc) return null;

  const handleDownload = async () => {
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await documentsApi.downloadDocument(organizationId, doc.id, doc.originalFilename);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleTriggerExtraction = async () => {
    setIsProcessingAction(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await documentsApi.triggerExtraction(organizationId, doc.id);
      setActionSuccess('Extraction job successfully enqueued.');
      // Refresh metadata
      await loadPipelineMetadata(doc.id);
      // Fetch fresh document state
      const freshDoc = await documentsApi.getDocument(organizationId, doc.id);
      if (onDocumentUpdated) onDocumentUpdated(freshDoc.document);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to trigger extraction.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleTriggerOCR = async () => {
    setIsProcessingAction(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await documentsApi.triggerOCR(organizationId, doc.id);
      setActionSuccess('OCR processing job successfully enqueued.');
      await loadPipelineMetadata(doc.id);
      const freshDoc = await documentsApi.getDocument(organizationId, doc.id);
      if (onDocumentUpdated) onDocumentUpdated(freshDoc.document);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to trigger OCR processing.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete document "${doc.originalFilename}"?`)) {
      return;
    }

    setIsProcessingAction(true);
    setActionError(null);
    try {
      await documentsApi.deleteDocument(organizationId, doc.id);
      if (onDocumentDeleted) onDocumentDeleted(doc.id);
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete document.');
      setIsProcessingAction(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
      case 'COMPLETED':
      case 'EXTRACTED':
      case 'OCR_COMPLETED':
        return <Badge variant="success">{status}</Badge>;
      case 'EXTRACTING':
      case 'EXTRACTION_QUEUED':
      case 'OCR_QUEUED':
      case 'OCR_PROCESSING':
      case 'PROCESSING':
      case 'VALIDATING':
        return <Badge variant="warning">{status}</Badge>;
      case 'OCR_REQUIRED':
        return <Badge variant="teal">{status}</Badge>;
      case 'EXTRACTION_FAILED':
      case 'OCR_FAILED':
      case 'FAILED':
      case 'REJECTED':
        return <Badge variant="critical">{status}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const canExtract = ['READY', 'EXTRACTION_FAILED', 'EXTRACTION_PARTIAL'].includes(doc.status);
  const canOCR = ['OCR_REQUIRED', 'OCR_FAILED', 'READY'].includes(doc.status);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Document Inspection & Provenance"
      description={`Asset ID: ${doc.id}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {hasPermission('DOCUMENT_DELETE') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isProcessingAction}
                className="text-accent-critical hover:bg-rose-50 hover:border-rose-300"
                leftIcon={<Trash2 className="w-3.5 h-3.5 text-accent-critical" />}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/findings?documentId=${doc.id}`} onClick={onClose}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<SearchCode className="w-3.5 h-3.5 text-brand-teal" />}
              >
                View Findings & Risk
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {hasPermission('DOCUMENT_DOWNLOAD') && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownload}
                isLoading={isProcessingAction}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Download Source
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Alerts */}
        {actionError && (
          <Alert variant="critical" title="Operation Notice" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}
        {actionSuccess && (
          <Alert variant="success" title="Success" onDismiss={() => setActionSuccess(null)}>
            {actionSuccess}
          </Alert>
        )}

        {/* Header Document Summary Card */}
        <div className="p-4 rounded-lg border border-surface-border bg-surface-cool flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-brand-pale-teal text-brand-teal flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-deep-teal break-all">
                {doc.originalFilename}
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Format: <strong className="uppercase font-mono">.{doc.extension}</strong> • Size: {formatFileSize(doc.size)}
              </p>
            </div>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1.5 shrink-0">
            {renderStatusBadge(doc.status)}
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Technical Provenance Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-lg border border-surface-border bg-surface-white space-y-2">
            <h4 className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5 border-b border-surface-border pb-1.5">
              <FileCheck className="w-3.5 h-3.5 text-brand-teal" />
              Cryptographic Integrity
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex flex-col">
                <span className="text-text-secondary text-[11px]">SHA-256 Checksum:</span>
                <span className="font-mono text-[11px] text-text-primary break-all bg-slate-50 p-1 rounded border border-surface-border mt-0.5 select-all">
                  {doc.checksum}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-text-secondary">Detected MIME:</span>
                <span className="font-mono text-text-primary text-[11px]">{doc.detectedMimeType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Declared MIME:</span>
                <span className="font-mono text-text-primary text-[11px]">{doc.declaredMimeType}</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-surface-border bg-surface-white space-y-2">
            <h4 className="text-xs font-semibold text-brand-deep-teal flex items-center gap-1.5 border-b border-surface-border pb-1.5">
              <Cpu className="w-3.5 h-3.5 text-brand-teal" />
              Processing Pipeline Lifecycle
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Document Lifecycle:</span>
                {renderStatusBadge(doc.status)}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Extraction Status:</span>
                {extractionInfo ? (
                  <Badge variant={extractionInfo.extractionStatus === 'COMPLETE' ? 'success' : 'neutral'} size="sm">
                    {extractionInfo.extractionStatus}
                  </Badge>
                ) : (
                  <span className="text-text-muted text-[11px]">Not evaluated</span>
                )}
              </div>
              {ocrInfo && (
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">OCR Status:</span>
                  <Badge variant={ocrInfo.status === 'COMPLETED' ? 'success' : 'warning'} size="sm">
                    {ocrInfo.status}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Structural Extraction Metadata */}
        {isLoadingMetadata ? (
          <div className="space-y-2">
            <Skeleton height={20} width={150} />
            <Skeleton height={60} />
          </div>
        ) : extractionInfo && extractionInfo.extractionStatus !== 'NOT_EXTRACTED' ? (
          <div className="p-3.5 rounded-lg border border-surface-border bg-surface-white space-y-2.5">
            <h4 className="text-xs font-semibold text-brand-deep-teal flex items-center justify-between border-b border-surface-border pb-1.5">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand-teal" />
                Structural Block Metadata
              </span>
              <span className="text-[11px] font-mono font-normal text-text-muted">
                v{extractionInfo.schemaVersion}
              </span>
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded bg-surface-cool border border-surface-border">
                <span className="text-[10px] uppercase text-text-secondary block font-medium">Pages</span>
                <span className="text-sm font-bold text-brand-deep-teal tabular-nums">
                  {extractionInfo.pageCount}
                </span>
              </div>
              <div className="p-2 rounded bg-surface-cool border border-surface-border">
                <span className="text-[10px] uppercase text-text-secondary block font-medium">Text Blocks</span>
                <span className="text-sm font-bold text-brand-deep-teal tabular-nums">
                  {extractionInfo.blockCount}
                </span>
              </div>
              <div className="p-2 rounded bg-surface-cool border border-surface-border">
                <span className="text-[10px] uppercase text-text-secondary block font-medium">Tables</span>
                <span className="text-sm font-bold text-brand-deep-teal tabular-nums">
                  {extractionInfo.tableCount}
                </span>
              </div>
            </div>

            {extractionInfo.warnings && extractionInfo.warnings.length > 0 && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-1.5 mt-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[11px]">Extraction Warnings:</span>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5">
                    {extractionInfo.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Action Controls for Pipeline Execution */}
        <div className="p-3.5 rounded-lg border border-dashed border-surface-border bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-brand-deep-teal">Pipeline Trigger Operations</span>
            <span className="text-[11px] text-text-secondary">
              Execute asynchronous extraction or optical character recognition on this source asset.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canExtract && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerExtraction}
                disabled={isProcessingAction}
                isLoading={isProcessingAction}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Trigger Extraction
              </Button>
            )}
            {canOCR && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerOCR}
                disabled={isProcessingAction}
                isLoading={isProcessingAction}
                leftIcon={<FileSearch className="w-3.5 h-3.5 text-brand-teal" />}
              >
                Trigger OCR
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
