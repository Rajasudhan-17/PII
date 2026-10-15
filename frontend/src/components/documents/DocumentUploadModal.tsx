import React, { useState, useRef, useCallback } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { documentsApi } from '../../api/documents.api';
import { DocumentItem } from '../../types/document';
import { Upload, FileText, CheckCircle, X } from 'lucide-react';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  onUploadSuccess: (document: DocumentItem) => void;
}

const ALLOWED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'tif',
  'tiff',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'csv',
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'flac',
  'mp4',
  'mkv',
  'mov',
  'webm',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (aligned with backend env MAX_UPLOAD_SIZE_BYTES)

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  onUploadSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setIsDragging(false);
    setIsUploading(false);
    setUploadProgress(0);
    setValidationError(null);
    setServerError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = () => {
    if (isUploading) return; // Prevent closing while in transit
    resetState();
    onClose();
  };

  const validateFile = (file: File): boolean => {
    setValidationError(null);
    setServerError(null);

    // 1. Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setValidationError(
        `Selected file (${sizeMB} MB) exceeds maximum allowed upload limit of 10 MB.`
      );
      return false;
    }

    if (file.size === 0) {
      setValidationError('Cannot upload an empty (0 byte) file.');
      return false;
    }

    // 2. Check file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      setValidationError(
        `File format ".${ext || 'unknown'}" is not supported. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
      return false;
    }

    return true;
  };

  const handleFileSelection = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(20);
    setServerError(null);

    try {
      // Step simulation for accurate visual feedback during transit
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressTimer);
            return 85;
          }
          return prev + 15;
        });
      }, 150);

      const res = await documentsApi.uploadDocument(organizationId, selectedFile);
      clearInterval(progressTimer);
      setUploadProgress(100);

      // Successfully uploaded to backend
      setTimeout(() => {
        onUploadSuccess(res.document);
        handleClose();
      }, 400);
    } catch (err: unknown) {
      setIsUploading(false);
      setUploadProgress(0);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Document upload failed. Verify service connection.';
      setServerError(errMsg);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Source Document"
      description={`Securely upload a document to organization workspace [${organizationId}] for automated extraction and privacy processing.`}
      maxWidth="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            isLoading={isUploading}
            leftIcon={<Upload className="w-3.5 h-3.5" />}
          >
            {isUploading ? 'Uploading & Validating...' : 'Upload Document'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Error Alerts */}
        {validationError && (
          <Alert
            variant="warning"
            title="Validation Warning"
            onDismiss={() => setValidationError(null)}
          >
            {validationError}
          </Alert>
        )}

        {serverError && (
          <Alert
            variant="critical"
            title="Upload Error"
            onDismiss={() => setServerError(null)}
          >
            {serverError}
          </Alert>
        )}

        {/* Dropzone */}
        {!selectedFile ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click();
              }
            }}
            className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all select-none ${
              isDragging
                ? 'border-brand-teal bg-brand-pale-teal/50 scale-[1.01]'
                : 'border-surface-border bg-surface-cool/50 hover:bg-surface-cool hover:border-slate-300'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.docx,.xlsx,.pptx,.txt,.csv,.mp3,.wav,.m4a,.ogg,.flac,.mp4,.mkv,.mov,.webm"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelection(e.target.files[0]);
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-brand-pale-teal text-brand-teal flex items-center justify-center mx-auto mb-3 shadow-subtle">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Drag & drop document here, or <span className="text-brand-teal underline">browse</span>
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Supports PDF, PNG, JPG, TIFF, DOCX, XLSX, PPTX, TXT, CSV, Audio & Video (up to 10 MB)
            </p>
          </div>
        ) : (
          /* Selected File Card */
          <div className="p-4 rounded-lg border border-surface-border bg-surface-cool">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-brand-pale-teal text-brand-teal flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-brand-deep-teal truncate max-w-[280px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {formatFileSize(selectedFile.size)} • Type: {selectedFile.type || 'Binary stream'}
                  </p>
                </div>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={resetState}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  title="Remove file"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="mt-4 pt-3 border-t border-surface-border">
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium text-text-secondary">
                  <span>Uploading payload to quarantine...</span>
                  <span className="tabular-nums font-mono text-brand-deep-teal font-semibold">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-teal transition-all duration-200 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Security / Validation Notice */}
        <div className="p-3 rounded bg-slate-50 border border-surface-border flex items-start gap-2.5 text-xs text-text-secondary">
          <CheckCircle className="w-4 h-4 text-brand-teal shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Uploaded files are quarantined, analyzed with binary magic bytes verification, and cryptographically hashed with SHA-256 before ingestion into isolated tenant storage.
          </p>
        </div>
      </div>
    </Dialog>
  );
};
