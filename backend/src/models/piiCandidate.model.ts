import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { PIICategory, PIIType, PIISeverity } from '../config/piiTaxonomy';
import { BoundingBox } from './normalizedDocument.model';

export type DetectorType = 'DETERMINISTIC' | 'PATTERN' | 'NER_MODEL' | 'HEURISTIC';
export type PIISourceType = 'NATIVE_TEXT' | 'PRINT_OCR' | 'HANDWRITING_HTR' | 'GENERIC_OCR_FALLBACK';

export interface IPIICandidateLocation {
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  blockId?: string;
  boundingBox?: BoundingBox | null;
}

export interface IPIICandidateProvenance {
  sourceType: PIISourceType;
  blockId: string;
  extractorVersion?: string;
}

export interface IPIICandidate extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  candidateId: string;
  detectionRunId: string;
  documentId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  type: PIIType;
  category: PIICategory;
  text: string;
  normalizedValue: string;
  confidence: number; // Kept for backward compatibility (= detectionScore)
  recognitionConfidence: number | null; // OCR/HTR confidence
  detectionScore: number; // PII match score (0-1)
  severity: PIISeverity;
  sensitivityScore: number; // Category sensitivity score (0-1)
  evidence: string[]; // e.g. ['PATTERN_MATCH', 'CHECKSUM_VALID']
  detectorName: string;
  detectorType: DetectorType;
  decision: null; // STRICT INVARIANT: Always null in Phase 07
  isMasked: boolean;
  isRedacted: boolean;
  location: IPIICandidateLocation;
  provenance: IPIICandidateProvenance;
  detectionStatus: 'DETECTED' | 'FAILED' | 'SKIPPED';
  createdAt: Date;
  updatedAt: Date;
}

const boundingBoxSchema = new Schema<BoundingBox>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false }
);

const locationSchema = new Schema<IPIICandidateLocation>(
  {
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    pageNumber: { type: Number },
    blockId: { type: String },
    boundingBox: { type: boundingBoxSchema, default: null },
  },
  { _id: false }
);

const provenanceSchema = new Schema<IPIICandidateProvenance>(
  {
    sourceType: {
      type: String,
      enum: ['NATIVE_TEXT', 'PRINT_OCR', 'HANDWRITING_HTR', 'GENERIC_OCR_FALLBACK'],
      required: true,
    },
    blockId: { type: String, required: true },
    extractorVersion: { type: String },
  },
  { _id: false }
);

const piiCandidateSchema = new Schema<IPIICandidate>(
  {
    candidateId: { type: String, required: true, unique: true, index: true },
    detectionRunId: { type: String, required: true, index: true },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(PIIType),
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(PIICategory),
      required: true,
      index: true,
    },
    text: { type: String, required: true },
    normalizedValue: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    recognitionConfidence: { type: Number, default: null },
    detectionScore: { type: Number, required: true, min: 0, max: 1 },
    severity: {
      type: String,
      enum: Object.values(PIISeverity),
      required: true,
    },
    sensitivityScore: { type: Number, required: true, min: 0, max: 1 },
    evidence: { type: [String], default: [] },
    detectorName: { type: String, required: true },
    detectorType: {
      type: String,
      enum: ['DETERMINISTIC', 'PATTERN', 'NER_MODEL', 'HEURISTIC'],
      required: true,
    },
    decision: { type: Schema.Types.Mixed, default: null },
    isMasked: { type: Boolean, default: false },
    isRedacted: { type: Boolean, default: false },
    location: { type: locationSchema, required: true },
    provenance: { type: provenanceSchema, required: true },
    detectionStatus: {
      type: String,
      enum: ['DETECTED', 'FAILED', 'SKIPPED'],
      default: 'DETECTED',
    },
  },
  { timestamps: true }
);

piiCandidateSchema.index({ organizationId: 1, documentId: 1, detectionRunId: 1 });
piiCandidateSchema.index({ documentId: 1, type: 1 });

export const PIICandidateModel = mongoose.model<IPIICandidate>(
  'PIICandidate',
  piiCandidateSchema
);
