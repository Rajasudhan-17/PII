import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { ReidentificationRiskLevel } from './reidentificationRiskRun.model';

export type RiskSignalType =
  | 'DIRECT_IDENTIFIER_SIGNAL'
  | 'QUASI_IDENTIFIER_SIGNAL'
  | 'UNIQUENESS_SIGNAL'
  | 'COMBINATION_SIGNAL'
  | 'GEOGRAPHIC_PRECISION_SIGNAL'
  | 'TEMPORAL_PRECISION_SIGNAL'
  | 'LINKAGE_SIGNAL'
  | 'HEURISTIC_RARITY_SIGNAL'
  | 'RESIDUAL_IDENTIFIER_SIGNAL';

export type ReferencePopulationMode =
  | 'REFERENCE_DATA_AVAILABLE'
  | 'REFERENCE_DATA_UNAVAILABLE'
  | 'HEURISTIC';

export type RiskProvenanceSource =
  | 'UPSTREAM_DETECTION_PROVENANCE'
  | 'RESIDUAL_ARTIFACT_SIGNAL'
  | 'SANITIZATION_RESIDUAL_SIGNAL'
  | 'METADATA_RESIDUAL_SIGNAL'
  | 'CONTEXT_RESULT';

export interface IRiskProvenance {
  provenanceSource?: RiskProvenanceSource | null;
  page?: number | null;
  blockIndex?: number | null;
  targetPath?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
}

export interface IReidentificationRiskResult extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  riskResultId: string;
  riskRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  sanitizedArtifactId: string;
  signalType: RiskSignalType;
  riskLevel: ReidentificationRiskLevel;
  riskScore: number; // 0.00 to 1.00
  confidence: number; // 0.00 to 1.00
  attributes: string[]; // e.g. ['age', 'city', 'department']
  kAnonymityEstimate?: number | null; // e.g. 50 or null if unknown
  lDiversitySignal?: string | null;
  referencePopulationMode: ReferencePopulationMode;
  provenance?: IRiskProvenance | null;
  reasonCode: string;
  explanation: string;
  warnings: string[];
  createdAt: Date;
  updatedAt: Date;
}

const provenanceSchema = new Schema<IRiskProvenance>(
  {
    provenanceSource: {
      type: String,
      enum: [
        'UPSTREAM_DETECTION_PROVENANCE',
        'RESIDUAL_ARTIFACT_SIGNAL',
        'SANITIZATION_RESIDUAL_SIGNAL',
        'METADATA_RESIDUAL_SIGNAL',
        'CONTEXT_RESULT',
      ],
      default: 'UPSTREAM_DETECTION_PROVENANCE',
    },
    page: { type: Number, default: null },
    blockIndex: { type: Number, default: null },
    targetPath: { type: String, default: null },
    startOffset: { type: Number, default: null },
    endOffset: { type: Number, default: null },
  },
  { _id: false }
);

const reidentificationRiskResultSchema = new Schema<IReidentificationRiskResult>(
  {
    riskResultId: { type: String, required: true, unique: true, index: true },
    riskRunId: { type: String, required: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    sanitizedArtifactId: { type: String, required: true, index: true },
    signalType: {
      type: String,
      enum: [
        'DIRECT_IDENTIFIER_SIGNAL',
        'QUASI_IDENTIFIER_SIGNAL',
        'UNIQUENESS_SIGNAL',
        'COMBINATION_SIGNAL',
        'GEOGRAPHIC_PRECISION_SIGNAL',
        'TEMPORAL_PRECISION_SIGNAL',
        'LINKAGE_SIGNAL',
        'HEURISTIC_RARITY_SIGNAL',
        'RESIDUAL_IDENTIFIER_SIGNAL',
      ],
      required: true,
      index: true,
    },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'CRITICAL'],
      required: true,
      index: true,
    },
    riskScore: { type: Number, required: true },
    confidence: { type: Number, required: true, default: 1.0 },
    attributes: [{ type: String }],
    kAnonymityEstimate: { type: Number, default: null },
    lDiversitySignal: { type: String, default: null },
    referencePopulationMode: {
      type: String,
      enum: ['REFERENCE_DATA_AVAILABLE', 'REFERENCE_DATA_UNAVAILABLE', 'HEURISTIC'],
      default: 'HEURISTIC',
      required: true,
    },
    provenance: { type: provenanceSchema, default: null },
    reasonCode: { type: String, required: true },
    explanation: { type: String, required: true },
    warnings: [{ type: String }],
  },
  { timestamps: true }
);

export const ReidentificationRiskResultModel = mongoose.model<IReidentificationRiskResult>(
  'ReidentificationRiskResult',
  reidentificationRiskResultSchema
);
