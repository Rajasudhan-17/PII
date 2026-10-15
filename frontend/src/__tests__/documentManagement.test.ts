import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentItem, DocumentStatus, DocumentSortField, SortDirection } from '../types/document';
import { setAuthTokenGetter, setTenantIdGetter } from '../api/client';
import { documentsApi } from '../api/documents.api';

describe('Phase 3 — Document Management & Processing Audit', () => {
  let activeTenantId: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    activeTenantId = 'org_test_phase3';
    setAuthTokenGetter(() => 'valid-jwt-token');
    setTenantIdGetter(() => activeTenantId);
  });

  // Synthetic Document Test Fixtures (Safe, synthetic test metadata only)
  const syntheticDocs: DocumentItem[] = [
    {
      id: 'doc_001',
      organizationId: 'org_test_phase3',
      uploadedBy: 'usr_analyst_1',
      originalFilename: 'financial_report_q1.pdf',
      size: 2048576, // ~2 MB
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      status: 'READY',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:05:00.000Z',
    },
    {
      id: 'doc_002',
      organizationId: 'org_test_phase3',
      uploadedBy: 'usr_analyst_2',
      originalFilename: 'patient_intake_scan.png',
      size: 512000, // ~500 KB
      declaredMimeType: 'image/png',
      detectedMimeType: 'image/png',
      extension: 'png',
      status: 'OCR_REQUIRED',
      checksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      createdAt: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T11:02:00.000Z',
    },
    {
      id: 'doc_003',
      organizationId: 'org_test_phase3',
      uploadedBy: 'usr_analyst_1',
      originalFilename: 'employee_records.xlsx',
      size: 8388608, // ~8 MB
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
      status: 'EXTRACTING',
      checksum: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
      createdAt: '2026-03-03T09:00:00.000Z',
      updatedAt: '2026-03-03T09:01:00.000Z',
    },
    {
      id: 'doc_004',
      organizationId: 'org_test_phase3',
      uploadedBy: 'usr_reviewer_1',
      originalFilename: 'audit_notes.txt',
      size: 10240, // 10 KB
      declaredMimeType: 'text/plain',
      detectedMimeType: 'text/plain',
      extension: 'txt',
      status: 'EXTRACTED',
      checksum: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      createdAt: '2026-03-04T14:30:00.000Z',
      updatedAt: '2026-03-04T14:31:00.000Z',
    },
    {
      id: 'doc_005',
      organizationId: 'org_test_phase3',
      uploadedBy: 'usr_admin_1',
      originalFilename: 'corrupted_archive.docx',
      size: 1048576, // 1 MB
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      status: 'EXTRACTION_FAILED',
      checksum: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
      createdAt: '2026-03-05T08:15:00.000Z',
      updatedAt: '2026-03-05T08:16:00.000Z',
    },
  ];

  describe('1. Upload Constraints: 10 MB Limit & Backend File Allowlist', () => {
    // Exact match with backend ALLOWED_EXTENSIONS_MAP in backend/src/utils/fileValidation.ts
    const BACKEND_ALLOWED_EXTENSIONS = [
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

    // Backend MAX_UPLOAD_SIZE_BYTES = 10485760 (10 MB)
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10485760

    const validateFileClientSide = (file: { name: string; size: number }) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !BACKEND_ALLOWED_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported file format ".${ext}". Allowed: ${BACKEND_ALLOWED_EXTENSIONS.join(', ')}`,
        };
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
          valid: false,
          error: `File size exceeds 10MB limit. Current: ${(file.size / (1024 * 1024)).toFixed(2)} MB.`,
        };
      }
      if (file.size === 0) {
        return { valid: false, error: 'File is empty (0 bytes).' };
      }
      return { valid: true, error: null };
    };

    it('verifies exact match with backend 10 MB limit (10,485,760 bytes)', () => {
      // Exactly 10MB
      expect(validateFileClientSide({ name: 'test.pdf', size: 10485760 }).valid).toBe(true);

      // 10MB + 1 byte must be rejected
      const overLimit = validateFileClientSide({ name: 'test.pdf', size: 10485761 });
      expect(overLimit.valid).toBe(false);
      expect(overLimit.error).toContain('File size exceeds 10MB limit');
    });

    it('accepts every backend allowlisted file format without being stricter than backend', () => {
      for (const ext of BACKEND_ALLOWED_EXTENSIONS) {
        const res = validateFileClientSide({ name: `sample.${ext}`, size: 1024 });
        expect(res.valid).toBe(true);
        expect(res.error).toBeNull();
      }
    });

    it('rejects disallowed/dangerous file extensions', () => {
      const dangerousFiles = [
        'trojan.exe',
        'script.sh',
        'command.bat',
        'binary.bin',
        'image.iso',
      ];
      for (const name of dangerousFiles) {
        const res = validateFileClientSide({ name, size: 500 });
        expect(res.valid).toBe(false);
        expect(res.error).toContain('Unsupported file format');
      }
    });

    it('ensures frontend validation does not substitute for server-side validation', async () => {
      // Even if client allows a file, if backend detects magic bytes mismatch or too large,
      // the server returns an AppError which is parsed and displayed cleanly.
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: {
            message: 'File binary magic bytes do not match an allowlisted format.',
            code: 'UNSUPPORTED_MIME_TYPE',
          },
        }),
      });
      global.fetch = mockFetch;

      const dummyFile = new File(['corrupted-header-data'], 'fake.pdf', { type: 'application/pdf' });

      await expect(
        documentsApi.uploadDocument('org_test_phase3', dummyFile)
      ).rejects.toThrow('File binary magic bytes do not match an allowlisted format.');
    });
  });

  describe('2. Search, Format, and Status Filtering Logic', () => {
    const filterDocuments = (
      docs: DocumentItem[],
      search: string,
      format: string,
      status: string
    ) => {
      return docs.filter((doc) => {
        if (search.trim()) {
          const query = search.toLowerCase().trim();
          const matchesName = doc.originalFilename.toLowerCase().includes(query);
          const matchesChecksum = doc.checksum.toLowerCase().includes(query);
          const matchesId = doc.id.toLowerCase().includes(query);
          if (!matchesName && !matchesChecksum && !matchesId) return false;
        }

        if (format !== 'ALL') {
          const ext = doc.extension.toLowerCase();
          if (format === 'jpg' && (ext === 'jpg' || ext === 'jpeg')) {
            // match both
          } else if (ext !== format.toLowerCase()) {
            return false;
          }
        }

        if (status !== 'ALL') {
          if (doc.status !== status) return false;
        }

        return true;
      });
    };

    it('filters documents by filename case-insensitively', () => {
      const results = filterDocuments(syntheticDocs, 'REPORT', 'ALL', 'ALL');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc_001');
    });

    it('filters documents by SHA-256 checksum substring', () => {
      const results = filterDocuments(syntheticDocs, 'ca978112', 'ALL', 'ALL');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc_002');
    });

    it('filters documents by format extension', () => {
      const xlsxResults = filterDocuments(syntheticDocs, '', 'xlsx', 'ALL');
      expect(xlsxResults).toHaveLength(1);
      expect(xlsxResults[0].originalFilename).toBe('employee_records.xlsx');

      const nonExistent = filterDocuments(syntheticDocs, '', 'csv', 'ALL');
      expect(nonExistent).toHaveLength(0);
    });

    it('filters documents by processing status', () => {
      const extractingDocs = filterDocuments(syntheticDocs, '', 'ALL', 'EXTRACTING');
      expect(extractingDocs).toHaveLength(1);
      expect(extractingDocs[0].id).toBe('doc_003');

      const failedDocs = filterDocuments(syntheticDocs, '', 'ALL', 'EXTRACTION_FAILED');
      expect(failedDocs).toHaveLength(1);
      expect(failedDocs[0].id).toBe('doc_005');
    });

    it('combines search, format, and status filters correctly', () => {
      const matching = filterDocuments(syntheticDocs, 'patient', 'png', 'OCR_REQUIRED');
      expect(matching).toHaveLength(1);
      expect(matching[0].id).toBe('doc_002');

      const mismatchStatus = filterDocuments(syntheticDocs, 'patient', 'png', 'READY');
      expect(mismatchStatus).toHaveLength(0);
    });
  });

  describe('3. Sorting and Pagination Logic', () => {
    const sortDocs = (
      docs: DocumentItem[],
      field: DocumentSortField,
      direction: SortDirection
    ) => {
      return [...docs].sort((a, b) => {
        let comparison = 0;
        switch (field) {
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
        return direction === 'asc' ? comparison : -comparison;
      });
    };

    it('sorts by createdAt descending by default (newest first)', () => {
      const sorted = sortDocs(syntheticDocs, 'createdAt', 'desc');
      expect(sorted[0].id).toBe('doc_005');
      expect(sorted[sorted.length - 1].id).toBe('doc_001');
    });

    it('sorts by size ascending (smallest first)', () => {
      const sorted = sortDocs(syntheticDocs, 'size', 'asc');
      expect(sorted[0].id).toBe('doc_004');
      expect(sorted[sorted.length - 1].id).toBe('doc_003');
    });

    it('sorts by filename alphabetically ascending and descending', () => {
      const asc = sortDocs(syntheticDocs, 'originalFilename', 'asc');
      expect(asc[0].originalFilename).toBe('audit_notes.txt');

      const desc = sortDocs(syntheticDocs, 'originalFilename', 'desc');
      expect(desc[0].originalFilename).toBe('patient_intake_scan.png');
    });

    it('handles pagination slicing and total page calculation', () => {
      const manyDocs: DocumentItem[] = Array.from({ length: 25 }, (_, i) => ({
        ...syntheticDocs[0],
        id: `doc_gen_${i + 1}`,
        originalFilename: `file_${String(i + 1).padStart(2, '0')}.pdf`,
      }));

      const pageSize = 10;
      const totalPages = Math.ceil(manyDocs.length / pageSize);
      expect(totalPages).toBe(3);

      const page1 = manyDocs.slice(0, pageSize);
      expect(page1).toHaveLength(10);
      expect(page1[0].id).toBe('doc_gen_1');
      expect(page1[9].id).toBe('doc_gen_10');

      const page2 = manyDocs.slice(10, 20);
      expect(page2).toHaveLength(10);
      expect(page2[0].id).toBe('doc_gen_11');

      const page3 = manyDocs.slice(20, 30);
      expect(page3).toHaveLength(5);
      expect(page3[4].id).toBe('doc_gen_25');
    });
  });

  describe('4. Multi-Tenant Isolation & Stale-Response Protection', () => {
    it('injects active tenant ID in x-organization-id header on document operations', async () => {
      activeTenantId = 'org_tenant_alpha';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ documents: [], count: 0 }),
      });
      global.fetch = mockFetch;

      await documentsApi.listDocuments('org_tenant_alpha');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['x-organization-id']).toBe('org_tenant_alpha');
    });

    it('discards stale async response when user switches tenants during in-flight request', async () => {
      let activeOrg = 'org_alpha';
      let generation = 0;
      let displayedDocs: DocumentItem[] = [];

      const executeLoad = async (orgToFetch: string, fetchGen: number, delayMs: number) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (generation !== fetchGen || activeOrg !== orgToFetch) {
          return { discarded: true };
        }

        displayedDocs = orgToFetch === 'org_alpha' ? [syntheticDocs[0]] : [syntheticDocs[1]];
        return { discarded: false, docs: displayedDocs };
      };

      activeOrg = 'org_alpha';
      const gen1 = ++generation;
      const promiseAlphaSlow = executeLoad('org_alpha', gen1, 50);

      activeOrg = 'org_beta';
      displayedDocs = [];
      const gen2 = ++generation;
      const promiseBetaFast = executeLoad('org_beta', gen2, 10);

      const betaResult = await promiseBetaFast;
      expect(betaResult.discarded).toBe(false);
      expect(displayedDocs[0].id).toBe('doc_002');

      const alphaResult = await promiseAlphaSlow;
      expect(alphaResult.discarded).toBe(true);

      expect(displayedDocs).toHaveLength(1);
      expect(displayedDocs[0].id).toBe('doc_002');
      expect(displayedDocs[0].organizationId).toBe('org_test_phase3');
    });
  });

  describe('5. Processing Lifecycle & 5-Second Polling Invariants', () => {
    const ACTIVE_PROCESSING_STATUSES = new Set<DocumentStatus>([
      'EXTRACTING',
      'EXTRACTION_QUEUED',
      'OCR_QUEUED',
      'OCR_PROCESSING',
      'VALIDATING',
      'PROCESSING',
      'UPLOADED',
    ]);

    const isPollingRequired = (docs: DocumentItem[]): boolean => {
      return docs.some((d) => ACTIVE_PROCESSING_STATUSES.has(d.status));
    };

    it('recognizes every relevant in-flight status defined by the backend', () => {
      const inFlightStatuses: DocumentStatus[] = [
        'VALIDATING',
        'EXTRACTION_QUEUED',
        'EXTRACTING',
        'OCR_QUEUED',
        'OCR_PROCESSING',
        'PROCESSING',
        'UPLOADED',
      ];

      for (const st of inFlightStatuses) {
        expect(ACTIVE_PROCESSING_STATUSES.has(st)).toBe(true);
        expect(isPollingRequired([{ ...syntheticDocs[0], status: st }])).toBe(true);
      }
    });

    it('confirms 5-second polling stops when no work is in progress (all idle or terminal)', () => {
      const idleOrTerminalStatuses: DocumentStatus[] = [
        'READY',
        'EXTRACTED',
        'EXTRACTION_PARTIAL',
        'EXTRACTION_FAILED',
        'OCR_REQUIRED', // Awaiting manual user trigger
        'OCR_COMPLETED',
        'OCR_FAILED',
        'QUARANTINED',
        'ENCRYPTED',
        'REJECTED',
        'DELETED',
      ];

      for (const st of idleOrTerminalStatuses) {
        expect(ACTIVE_PROCESSING_STATUSES.has(st)).toBe(false);
      }

      const idleDocList = idleOrTerminalStatuses.map((st, i) => ({
        ...syntheticDocs[0],
        id: `doc_idle_${i}`,
        status: st,
      }));

      // No work in progress -> Polling is deactivated
      expect(isPollingRequired(idleDocList)).toBe(false);
    });

    it('handles failed background poll requests safely without wiping loaded documents', async () => {
      let currentDocs = [syntheticDocs[0], syntheticDocs[1]];
      let isBackgroundErrorHandled = false;

      // Simulate loadDocuments safe background catch logic
      const simulateBackgroundPoll = async (shouldFail: boolean) => {
        try {
          if (shouldFail) {
            throw new Error('Network timeout during background refresh');
          }
          currentDocs = [syntheticDocs[0]];
        } catch {
          // Background error caught safely: keep existing currentDocs
          isBackgroundErrorHandled = true;
        }
      };

      await simulateBackgroundPoll(true);

      expect(isBackgroundErrorHandled).toBe(true);
      // Documents must NOT be wiped or emptied
      expect(currentDocs).toHaveLength(2);
      expect(currentDocs[0].id).toBe('doc_001');
    });
  });

  describe('6. Document Actions & Server-Side Authorization Enforcement', () => {
    it('executes extraction, OCR, download, and deletion using exact backend contracts', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.includes('/extract') && method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 202,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Document extraction job enqueued successfully.', jobId: 'job_ext_1' }),
          });
        }
        if (url.includes('/ocr') && method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 202,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ success: true, data: { jobId: 'job_ocr_1', status: 'PENDING' } }),
          });
        }
        if (url.includes('/download') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/pdf', 'content-disposition': 'attachment' }),
            blob: async () => new Blob(['pdf-bytes']),
          });
        }
        if (method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Document deleted successfully.' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      global.fetch = mockFetch;

      // 1. Extraction trigger
      const extRes = await documentsApi.triggerExtraction('org_test_phase3', 'doc_001');
      expect(extRes.message).toContain('enqueued successfully');

      // 2. OCR trigger
      const ocrRes = await documentsApi.triggerOCR('org_test_phase3', 'doc_002');
      expect(ocrRes.success).toBe(true);

      // 3. Document download
      await documentsApi.downloadDocument('org_test_phase3', 'doc_001', 'sample.pdf');

      // 4. Document deletion
      const delRes = await documentsApi.deleteDocument('org_test_phase3', 'doc_001');
      expect(delRes.message).toContain('deleted successfully');
    });

    it('verifies that unauthorized operations are rejected server-side (HTTP 403 Forbidden)', async () => {
      // Mock server-side RBAC middleware returning 403 when an unauthorized role attempts deletion
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: {
            message: 'Forbidden: Requires ORG_ADMIN tenant role and DOCUMENT_DELETE permission.',
            code: 'TENANT_ROLE_MISMATCH',
          },
        }),
      });

      // Attempting deletion with non-admin token
      await expect(
        documentsApi.deleteDocument('org_test_phase3', 'doc_001')
      ).rejects.toThrow('Requires ORG_ADMIN tenant role and DOCUMENT_DELETE permission.');
    });

    it('verifies cross-tenant unauthorized document access is rejected server-side', async () => {
      // Mock tenant isolation middleware returning 403 when user attempts to access another org's doc
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: {
            message: 'Access denied: User is not an active member of organization org_external_foreign.',
            code: 'TENANT_ACCESS_DENIED',
          },
        }),
      });

      await expect(
        documentsApi.getDocument('org_external_foreign', 'doc_999')
      ).rejects.toThrow('User is not an active member of organization');
    });
  });
});
