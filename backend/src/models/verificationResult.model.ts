import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { OverallVerificationStatus } from './verificationRun.model';
import { IRiskProvenance } from './reidentificationRiskResult.model';

export type VerifierType =
  | 'CHECKSUM_VERIFIER'
  | 'ARTIFACT_INTEGRITY_VERIFIER'
  | 'STRUCTURAL_INTEGRITY_VERIFIER'
  | 'TRANSFORMATION_VERIFIER'
  | 'METADATA_VERIFIER'
  | 'PII_RESIDUAL_VERIFIER'
  | 'POLICY_VERIFIER'
  | 'PROVENANCE_VERIFIER'
  | 'RISK_CONSISTENCY_VERIFIER';

export type VerifierSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface IVerificationResult extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  verificationResultId: string;
  verificationRunId: string;
  organizationId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  sourceArtifactId: string;
  outputArtifactId: string;
  verifierType: VerifierType;
  status: OverallVerificationStatus;
  severity: VerifierSeverity;
  passed: boolean;
  reasonCode: string;
  explanation: string;
  expected?: string | null;
  observed?: string | null;
  findingsCount: number;
  provenance?: IRiskProvenance | null;
  warnings: string[];
  verifierVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const provenanceSchema = new Schema<IRiskProvenance>(
  {
    provenanceSource: { type: String, default: null },
    page: { type: Number, default: null },
    blockIndex: { type: Number, default: null },
    targetPath: { type: String, default: null },
    startOffset: { type: Number, default: null },
    endOffset: { type: Number, default: null },
  },
  { _id: false }
);

const verificationResultSchema = new Schema<IVerificationResult>(
  {
    verificationResultId: { type: String, required: true, unique: true, index: true },
    verificationRunId: { type: String, required: true, index: true },
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
    sourceArtifactId: { type: String, required: true, index: true },
    outputArtifactId: { type: String, required: true, index: true },
    verifierType: {
      type: String,
      enum: [
        'CHECKSUM_VERIFIER',
        'ARTIFACT_INTEGRITY_VERIFIER',
        'STRUCTURAL_INTEGRITY_VERIFIER',
        'TRANSFORMATION_VERIFIER',
        'METADATA_VERIFIER',
        'PII_RESIDUAL_VERIFIER',
        'POLICY_VERIFIER',
        'PROVENANCE_VERIFIER',
        'RISK_CONSISTENCY_VERIFIER',
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['VERIFIED', 'FAILED', 'PARTIAL', 'NOT_VERIFIABLE'],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
      default: 'HIGH',
      required: true,
    },
    passed: { type: Boolean, required: true },
    reasonCode: { type: String, required: true },
    explanation: { type: String, required: true },
    expected: { type: String, default: null },
    observed: { type: String, default: null },
    findingsCount: { type: Number, default: 0 },
    provenance: { type: provenanceSchema, default: null },
    warnings: [{ type: String }],
    verifierVersion: { type: String, default: '1.0.0' },
  },
  { timestamps: true }
);

export const VerificationResultModel = mongoose.model<IVerificationResult>(
  'VerificationResult',
  verificationResultSchema
);
