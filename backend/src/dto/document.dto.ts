import { IDocument } from '../models/document.model';

export interface DocumentResponseDTO {
  id: string;
  organizationId: string;
  uploadedBy: string;
  originalFilename: string;
  size: number;
  declaredMimeType: string;
  detectedMimeType: string;
  extension: string;
  status: string;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export const toDocumentResponseDTO = (doc: IDocument): DocumentResponseDTO => {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    uploadedBy: doc.uploadedBy.toString(),
    originalFilename: doc.originalFilename,
    size: doc.size,
    declaredMimeType: doc.declaredMimeType,
    detectedMimeType: doc.detectedMimeType,
    extension: doc.extension,
    status: doc.status,
    checksum: doc.checksum,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
};
