import { api, getAuthHeaders } from './client';
import {
  DocumentItem,
  DocumentListResponse,
  ExtractionStatusResult,
  OCRStatusResult,
  PIISummaryResult,
} from '../types/document';

export const documentsApi = {
  // Core Document CRUD
  listDocuments: (orgId: string) =>
    api.get<DocumentListResponse>(`/organizations/${orgId}/documents`),

  getDocument: (orgId: string, docId: string) =>
    api.get<{ document: DocumentItem }>(`/organizations/${orgId}/documents/${docId}`),

  uploadDocument: (orgId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ message: string; document: DocumentItem }>(
      `/organizations/${orgId}/documents`,
      formData
    );
  },

  deleteDocument: (orgId: string, docId: string) =>
    api.delete<{ message: string }>(`/organizations/${orgId}/documents/${docId}`),

  // Download authenticated stream as Blob
  downloadDocument: async (orgId: string, docId: string, originalFilename: string): Promise<void> => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const url = `${API_BASE_URL}/organizations/${orgId}/documents/${docId}/download`;

    const authHeaders = getAuthHeaders();
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'x-organization-id': orgId,
        ...authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status} (${response.statusText})`);
    }

    const blob = await response.blob();
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const createObjectURL = window.URL?.createObjectURL || (typeof URL !== 'undefined' ? URL.createObjectURL : null);
      const revokeObjectURL = window.URL?.revokeObjectURL || (typeof URL !== 'undefined' ? URL.revokeObjectURL : null);
      if (createObjectURL && revokeObjectURL) {
        const blobUrl = createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = originalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        revokeObjectURL(blobUrl);
      }
    }
  },

  // Download authenticated transformed / redacted artifact stream as Blob
  downloadTransformedDocument: async (
    orgId: string,
    docId: string,
    filename?: string,
    options?: { runId?: string; outputArtifactId?: string }
  ): Promise<void> => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const params = new URLSearchParams();
    if (options?.runId) params.append('runId', options.runId);
    if (options?.outputArtifactId) params.append('outputArtifactId', options.outputArtifactId);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    // Prefer dedicated transformation route bound to exact run / artifact
    const url = `${API_BASE_URL}/organizations/${orgId}/documents/${docId}/transformations/download${queryString}`;

    const authHeaders = getAuthHeaders();
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'x-organization-id': orgId,
        ...authHeaders,
      },
    });

    if (!response.ok) {
      let errorMessage = `Download failed with status ${response.status} (${response.statusText})`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (errorJson?.message) {
          errorMessage = errorJson.message;
        } else if (errorJson?.error?.code) {
          errorMessage = `Download failed: ${errorJson.error.code}`;
        }
      } catch {
        // Non-JSON response
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const createObjectURL = window.URL?.createObjectURL || (typeof URL !== 'undefined' ? URL.createObjectURL : null);
      const revokeObjectURL = window.URL?.revokeObjectURL || (typeof URL !== 'undefined' ? URL.revokeObjectURL : null);
      if (createObjectURL && revokeObjectURL) {
        const blobUrl = createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'redacted_document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        revokeObjectURL(blobUrl);
      }
    }
  },

  // Asynchronous Extraction Lifecycle
  triggerExtraction: (orgId: string, docId: string) =>
    api.post<{ message: string; jobEnqueued?: boolean; jobId?: string }>(
      `/organizations/${orgId}/documents/${docId}/extract`
    ),

  getExtractionStatus: (orgId: string, docId: string) =>
    api.get<ExtractionStatusResult>(`/organizations/${orgId}/documents/${docId}/extraction`),

  // Asynchronous OCR / HTR Lifecycle
  triggerOCR: (orgId: string, docId: string, options?: { isHandwriting?: boolean; sync?: boolean }) =>
    api.post<{ success: boolean; data: { status: string; jobEnqueued?: boolean } }>(
      `/organizations/${orgId}/documents/${docId}/ocr`,
      options
    ),

  getOCRStatus: (orgId: string, docId: string) =>
    api.get<{ success: boolean; data: OCRStatusResult }>(
      `/organizations/${orgId}/documents/${docId}/ocr`
    ),

  // PII Detection Lifecycle
  triggerPIIDetection: (orgId: string, docId: string, options?: { async?: boolean; force?: boolean }) =>
    api.post<{ success: boolean; data: { status?: string; totalCandidates?: number } }>(
      `/organizations/${orgId}/documents/${docId}/pii-detection`,
      options
    ),

  getPIISummary: (orgId: string, docId: string) =>
    api.get<{ success: boolean; data: PIISummaryResult }>(
      `/organizations/${orgId}/documents/${docId}/pii-detection/summary`
    ),
};
