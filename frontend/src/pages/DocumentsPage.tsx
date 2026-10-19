import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { documentsApi } from '../api/documents.api';
import { useAuth } from '../context/AuthContext';
import { DocumentItem, DocumentSortField, DocumentStatus, SortDirection } from '../types/document';
import { DocumentUploadModal } from '../components/documents/DocumentUploadModal';
import { DocumentDetailsDialog } from '../components/documents/DocumentDetailsDialog';
import {
  Upload,
  RefreshCw,
  FileText,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-react';

const ACTIVE_PROCESSING_STATUSES = new Set<DocumentStatus>([
  'EXTRACTING',
  'EXTRACTION_QUEUED',
  'OCR_QUEUED',
  'OCR_PROCESSING',
  'VALIDATING',
  'PROCESSING',
  'UPLOADED',
]);

const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All Formats' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'pptx', label: 'PowerPoint (.pptx)' },
  { value: 'png', label: 'PNG (.png)' },
  { value: 'jpg', label: 'JPEG (.jpg, .jpeg)' },
  { value: 'txt', label: 'Text (.txt)' },
  { value: 'csv', label: 'CSV (.csv)' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'READY', label: 'Ready' },
  { value: 'EXTRACTING', label: 'Extracting' },
  { value: 'EXTRACTED', label: 'Extracted' },
  { value: 'EXTRACTION_FAILED', label: 'Extraction Failed' },
  { value: 'OCR_REQUIRED', label: 'OCR Required' },
  { value: 'OCR_PROCESSING', label: 'OCR Processing' },
  { value: 'OCR_COMPLETED', label: 'OCR Completed' },
  { value: 'OCR_FAILED', label: 'OCR Failed' },
  { value: 'QUARANTINED', label: 'Quarantined' },
  { value: 'ENCRYPTED', label: 'Encrypted' },
];

export const DocumentsPage: React.FC = () => {
  const { currentOrgId, organizations, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || organizations[0]?.id || '';

  // Core document state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Sorting state
  const [sortField, setSortField] = useState<DocumentSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Multi-tenant stale-response protection refs
  const activeOrgIdRef = useRef(activeOrgId);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  // Load documents with tenant validation & stale-response discard
  const loadDocuments = useCallback(
    async (isBackground = false) => {
      if (!activeOrgId) return;

      const currentGen = ++fetchGenerationRef.current;
      const targetOrgId = activeOrgId;

      if (!isBackground) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsRefreshing(true);
      }

      try {
        const res = await documentsApi.listDocuments(targetOrgId);

        // Stale check: Discard if organization switched or newer fetch was triggered
        if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== targetOrgId) {
          return;
        }

        setDocuments(res.documents || []);
      } catch (err) {
        if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== targetOrgId) {
          return;
        }
        // Background poll errors should not displace loaded documents or create alert spam
        if (!isBackground) {
          setError(err instanceof Error ? err.message : 'Failed to load organization documents');
        }
      } finally {
        if (currentGen === fetchGenerationRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [activeOrgId]
  );

  // Organization switch effect: instantly flush state and trigger fetch
  useEffect(() => {
    setDocuments([]);
    setSelectedDocument(null);
    setCurrentPage(1);
    setSearchQuery('');
    setFormatFilter('ALL');
    setStatusFilter('ALL');
    setError(null);
    setSuccessBanner(null);

    loadDocuments(false);
  }, [activeOrgId, loadDocuments]);

  // Lifecycle Polling: Check if any documents are in active processing state
  const hasActiveProcessing = useMemo(() => {
    return documents.some((doc) => ACTIVE_PROCESSING_STATUSES.has(doc.status));
  }, [documents]);

  useEffect(() => {
    if (!hasActiveProcessing) return;

    // 5000ms polling interval for in-flight tasks
    const timer = setInterval(() => {
      loadDocuments(true);
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [hasActiveProcessing, loadDocuments]);

  // Filtered and sorted documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Search filter: filename, checksum, id
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = doc.originalFilename.toLowerCase().includes(query);
        const matchesChecksum = doc.checksum.toLowerCase().includes(query);
        const matchesId = doc.id.toLowerCase().includes(query);
        if (!matchesName && !matchesChecksum && !matchesId) {
          return false;
        }
      }

      // Format filter
      if (formatFilter !== 'ALL') {
        const ext = doc.extension.toLowerCase();
        if (formatFilter === 'jpg' && (ext === 'jpg' || ext === 'jpeg')) {
          // match both
        } else if (ext !== formatFilter.toLowerCase()) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (doc.status !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [documents, searchQuery, formatFilter, statusFilter]);

  // Sorted documents
  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'originalFilename':
          comparison = a.originalFilename.localeCompare(b.originalFilename);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredDocuments, sortField, sortDirection]);

  // Pagination calculation
  const totalItems = sortedDocuments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedDocuments = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedDocuments.slice(startIndex, startIndex + pageSize);
  }, [sortedDocuments, safeCurrentPage, pageSize]);

  // Reset pagination when search or filters change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormatFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFormatFilter('ALL');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  const handleToggleSort = (field: DocumentSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Direct download handler
  const handleDirectDownload = async (doc: DocumentItem) => {
    setDownloadingDocId(doc.id);
    setError(null);
    try {
      await documentsApi.downloadDocument(activeOrgId, doc.id, doc.originalFilename);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to download ${doc.originalFilename}`);
    } finally {
      setDownloadingDocId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const renderStatusBadge = (status: DocumentStatus | string) => {
    switch (status) {
      case 'READY':
      case 'EXTRACTED':
      case 'OCR_COMPLETED':
      case 'COMPLETED':
        return <Badge variant="success">{status}</Badge>;
      case 'VALIDATING':
      case 'EXTRACTION_QUEUED':
      case 'EXTRACTING':
      case 'EXTRACTION_PARTIAL':
      case 'OCR_REQUIRED':
      case 'OCR_QUEUED':
      case 'OCR_PROCESSING':
      case 'PROCESSING':
        return <Badge variant="warning">{status}</Badge>;
      case 'EXTRACTION_FAILED':
      case 'OCR_FAILED':
      case 'QUARANTINED':
      case 'REJECTED':
      case 'FAILED':
        return <Badge variant="critical">{status}</Badge>;
      case 'ENCRYPTED':
      case 'DELETED':
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const isFiltersActive = searchQuery.trim() !== '' || formatFilter !== 'ALL' || statusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Repository"
        description="Ingest, extract, and inspect documents across all 8 supported file formats (TXT, CSV, PDF, Scanned PDF, DOCX, XLSX, PPTX, PNG)."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDocuments(false)}
              isLoading={isLoading || isRefreshing}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            {hasPermission('DOCUMENT_UPLOAD') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
                leftIcon={<Upload className="w-3.5 h-3.5" />}
              >
                Upload Document
              </Button>
            )}
          </div>
        }
      />

      {successBanner && (
        <Alert
          variant="success"
          title="Operation Complete"
          className="mb-4"
          onDismiss={() => setSuccessBanner(null)}
        >
          {successBanner}
        </Alert>
      )}

      {error && (
        <Alert variant="critical" title="Notice" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Format Matrix & Active Polling Status Banner */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-brand-deep-teal">Supported Formats:</span>
          {['TXT', 'CSV', 'Text PDF', 'Scanned PDF', 'DOCX', 'XLSX', 'PPTX', 'PNG / JPG'].map((fmt) => (
            <span
              key={fmt}
              className="px-2 py-0.5 rounded bg-surface-cool text-text-secondary border border-surface-border font-medium"
            >
              {fmt}
            </span>
          ))}
        </div>
        {hasActiveProcessing && (
          <div className="flex items-center gap-2 text-brand-teal font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-teal opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-teal" />
            </span>
            <span>Processing jobs active (auto-refreshing every 5s)</span>
          </div>
        )}
      </div>

      {/* Search, Filter, and Sorting Controls */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-2">
            <Input
              placeholder="Search by filename, checksum, or ID..."
              value={searchQuery}
              onChange={handleSearchChange}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          {/* Format Filter */}
          <div>
            <Select
              value={formatFilter}
              onChange={handleFormatChange}
              options={FORMAT_OPTIONS}
              aria-label="Filter by format"
            />
          </div>

          {/* Status Filter */}
          <div>
            <Select
              value={statusFilter}
              onChange={handleStatusChange}
              options={STATUS_OPTIONS}
              aria-label="Filter by status"
            />
          </div>
        </div>

        {/* Filter Summary & Active Filter Clear Button */}
        {isFiltersActive && (
          <div className="flex items-center justify-between pt-2 border-t border-surface-border text-xs text-text-secondary">
            <span>
              Showing <strong className="text-text-primary">{filteredDocuments.length}</strong> of{' '}
              <strong className="text-text-primary">{documents.length}</strong> documents matching filters
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              leftIcon={<XCircle className="w-3.5 h-3.5" />}
              className="h-7 text-xs text-text-muted hover:text-text-primary"
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton height={42} />
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No documents found in current organization"
          description={`Organization [${activeOrgId}] currently contains no uploaded documents. Upload a document to start PII detection and redaction pipelines.`}
          action={
            hasPermission('DOCUMENT_UPLOAD') ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
                leftIcon={<Upload className="w-3.5 h-3.5" />}
              >
                Upload Document
              </Button>
            ) : undefined
          }
        />
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          icon={<Filter className="w-6 h-6" />}
          title="No documents match criteria"
          description="Try adjusting your search query, format filter, or status filter."
          action={
            <Button variant="outline" size="sm" onClick={handleClearFilters}>
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleToggleSort('originalFilename')}
                      className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                    >
                      Filename
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleToggleSort('size')}
                      className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                    >
                      Size
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleToggleSort('status')}
                      className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                    >
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead>SHA-256 Checksum</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleToggleSort('createdAt')}
                      className="flex items-center gap-1 font-semibold text-text-secondary hover:text-text-primary focus:outline-none"
                    >
                      Uploaded At
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-semibold text-brand-deep-teal">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-brand-teal shrink-0" />
                        <span className="truncate max-w-[220px]" title={doc.originalFilename}>
                          {doc.originalFilename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="uppercase text-xs font-mono font-medium text-text-secondary bg-surface-cool px-1.5 py-0.5 rounded border border-surface-border">
                        .{doc.extension}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-text-secondary">
                      {formatFileSize(doc.size)}
                    </TableCell>
                    <TableCell>{renderStatusBadge(doc.status)}</TableCell>
                    <TableCell className="font-mono text-[11px] text-text-muted truncate max-w-[120px]" title={doc.checksum}>
                      {doc.checksum.substring(0, 10)}...
                    </TableCell>
                    <TableCell className="text-xs text-text-secondary tabular-nums">
                      {new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setSelectedDocument(doc)}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Inspect
                        </Button>
                        {hasPermission('DOCUMENT_DOWNLOAD') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-text-secondary hover:text-brand-teal"
                            title="Download document"
                            isLoading={downloadingDocId === doc.id}
                            onClick={() => handleDirectDownload(doc)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View (Hidden on desktop) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {paginatedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-brand-teal shrink-0" />
                    <span className="font-semibold text-sm text-brand-deep-teal truncate" title={doc.originalFilename}>
                      {doc.originalFilename}
                    </span>
                  </div>
                  {renderStatusBadge(doc.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary pt-1 border-t border-surface-border">
                  <div>
                    <span className="text-text-muted block text-[10px] uppercase font-mono">Format</span>
                    <span className="font-medium text-text-primary uppercase">.{doc.extension}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] uppercase font-mono">Size</span>
                    <span className="tabular-nums font-medium text-text-primary">{formatFileSize(doc.size)}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] uppercase font-mono">Uploaded</span>
                    <span className="tabular-nums font-medium text-text-primary">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] uppercase font-mono">SHA-256</span>
                    <span className="font-mono text-[11px] text-text-muted truncate block">
                      {doc.checksum.substring(0, 8)}...
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                  {hasPermission('DOCUMENT_DOWNLOAD') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs flex-1"
                      isLoading={downloadingDocId === doc.id}
                      onClick={() => handleDirectDownload(doc)}
                      leftIcon={<Download className="w-3.5 h-3.5" />}
                    >
                      Download
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs flex-1"
                    onClick={() => setSelectedDocument(doc)}
                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                  >
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 px-2 border border-surface-border rounded bg-surface-white text-text-primary text-xs focus:outline-none focus:border-brand-teal"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="ml-2 text-text-muted">
                Showing {totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1} to{' '}
                {Math.min(safeCurrentPage * pageSize, totalItems)} of {totalItems}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Page {safeCurrentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        organizationId={activeOrgId}
        onUploadSuccess={(newDoc) => {
          setIsUploadModalOpen(false);
          setSuccessBanner(`Document "${newDoc.originalFilename}" uploaded successfully.`);
          setDocuments((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
        }}
      />

      {/* Document Details Dialog */}
      <DocumentDetailsDialog
        isOpen={selectedDocument !== null}
        onClose={() => setSelectedDocument(null)}
        document={selectedDocument}
        organizationId={activeOrgId}
        onDocumentUpdated={(updatedDoc) => {
          setSelectedDocument(updatedDoc);
          setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
          setSuccessBanner(`Document "${updatedDoc.originalFilename}" state updated.`);
        }}
        onDocumentDeleted={(deletedDocId) => {
          setSelectedDocument(null);
          setDocuments((prev) => prev.filter((d) => d.id !== deletedDocId));
          setSuccessBanner(`Document was permanently deleted.`);
        }}
      />
    </div>
  );
};
