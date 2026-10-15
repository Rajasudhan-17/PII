import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { DecisionType } from '../config/policyTaxonomy';

export interface IDecisionResult extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  decisionResultId: string;
  decisionRunId: string;
  candidateId: string;
  documentId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  detectionRunId: string;
  contextAnalysisRunId: string;
  policyId: string;
  policyVersion: number;
  decision: DecisionType;
  decisionScore: number; // 0.0 to 1.0 separate decision confidence score
  matchedRuleIds: string[];
  rationaleCodes: string[];
  evaluationWarnings: string[];
  evaluatorVersion: string;
  policyConfigurationHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const decisionResultSchema = new Schema<IDecisionResult>(
  {
    decisionResultId: { type: String, required: true, unique: true, index: true },
    decisionRunId: { type: String, required: true, index: true },
    candidateId: { type: String, required: true, index: true },
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
    detectionRunId: { type: String, required: true, index: true },
    contextAnalysisRunId: { type: String, required: true, index: true },
    policyId: { type: String, required: true, index: true },
    policyVersion: { type: Number, required: true, default: 1 },
    decision: {
      type: String,
      enum: ['KEEP', 'REVIEW', 'REDACT'],
      required: true,
      index: true,
    },
    decisionScore: { type: Number, required: true, min: 0, max: 1 },
    matchedRuleIds: { type: [String], default: [] },
    rationaleCodes: { type: [String], default: [] },
    evaluationWarnings: { type: [String], default: [] },
    evaluatorVersion: { type: String, required: true, default: '1.0.0' },
    policyConfigurationHash: { type: String, required: true },
  },
  { timestamps: true }
);

decisionResultSchema.index({ organizationId: 1, documentId: 1, decisionRunId: 1 });
decisionResultSchema.index({ decisionRunId: 1, candidateId: 1 }, { unique: true });

export const DecisionResultModel = mongoose.model<IDecisionResult>(
  'DecisionResult',
  decisionResultSchema
);
