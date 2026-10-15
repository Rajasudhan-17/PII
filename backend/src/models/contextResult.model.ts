import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import {
  ContextSignalType,
  SemanticRole,
  AmbiguityIndicator,
  RelationshipType,
  RelationshipStatus,
} from '../config/contextTaxonomy';

export interface IContextWindowMetadata {
  type: 'SENTENCE' | 'PARAGRAPH' | 'TABLE_ROW' | 'TABLE_COLUMN' | 'SPREADSHEET' | 'HEADER_FOOTER' | 'BLOCK';
  textLength: number;
  startOffset: number;
  endOffset: number;
  blockId?: string;
  pageNumber?: number;
}

export interface IDocumentSectionMetadata {
  headingText?: string;
  blockType?: string;
  containerName?: string;
}

export interface IStructuralContextMetadata {
  isTable: boolean;
  isHeaderFooter: boolean;
  isForm: boolean;
  rowIndex?: number;
  columnIndex?: number;
  columnHeader?: string;
  tableId?: string;
  isSpreadsheet?: boolean;
  sheetName?: string;
}

export interface IRelationshipEvidence {
  relatedCandidateId: string;
  relatedType: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  evidenceDetails: string;
}

export interface IContextSignal {
  signalType: ContextSignalType;
  weight: number;
  provenance: string;
  description: string;
}

export interface IContextResult extends MongooseDocument {
  _id: mongoose.Types.ObjectId;
  contextResultId: string;
  contextAnalysisRunId: string;
  candidateId: string;
  documentId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  contextWindow: IContextWindowMetadata;
  semanticRole: SemanticRole;
  documentSection?: IDocumentSectionMetadata;
  fieldLabel: string | null;
  nearbyKeywords: string[];
  structuralContext: IStructuralContextMetadata;
  relationshipEvidence: IRelationshipEvidence[];
  contextSignals: IContextSignal[];
  contextualScore: number; // 0 to 1 heuristic strength score
  ambiguityIndicators: AmbiguityIndicator[];
  language: string;
  script: string;
  contextWarnings: string[];
  analyzerVersion: string;
  decision: null; // STRICT INVARIANT: Phase 08 decision is ALWAYS null
  createdAt: Date;
  updatedAt: Date;
}

const contextWindowSchema = new Schema<IContextWindowMetadata>(
  {
    type: {
      type: String,
      enum: ['SENTENCE', 'PARAGRAPH', 'TABLE_ROW', 'TABLE_COLUMN', 'SPREADSHEET', 'HEADER_FOOTER', 'BLOCK'],
      required: true,
    },
    textLength: { type: Number, required: true },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    blockId: { type: String },
    pageNumber: { type: Number },
  },
  { _id: false }
);

const documentSectionSchema = new Schema<IDocumentSectionMetadata>(
  {
    headingText: { type: String },
    blockType: { type: String },
    containerName: { type: String },
  },
  { _id: false }
);

const structuralContextSchema = new Schema<IStructuralContextMetadata>(
  {
    isTable: { type: Boolean, default: false },
    isHeaderFooter: { type: Boolean, default: false },
    isForm: { type: Boolean, default: false },
    rowIndex: { type: Number },
    columnIndex: { type: Number },
    columnHeader: { type: String },
    tableId: { type: String },
    isSpreadsheet: { type: Boolean, default: false },
    sheetName: { type: String },
  },
  { _id: false }
);

const relationshipEvidenceSchema = new Schema<IRelationshipEvidence>(
  {
    relatedCandidateId: { type: String, required: true },
    relatedType: { type: String, required: true },
    relationshipType: {
      type: String,
      enum: [
        'PERSON_NAME_EMAIL',
        'PERSON_NAME_PHONE',
        'PERSON_NAME_ADDRESS',
        'PERSON_NAME_DOB',
        'IDENTIFIER_OWNER',
        'UNKNOWN',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['SUPPORTED', 'WEAK', 'CONFLICTING', 'UNKNOWN'],
      required: true,
    },
    evidenceDetails: { type: String, required: true },
  },
  { _id: false }
);

const contextSignalSchema = new Schema<IContextSignal>(
  {
    signalType: {
      type: String,
      enum: [
        'FIELD_LABEL_MATCH',
        'SEMANTIC_NEIGHBOR_MATCH',
        'SECTION_MATCH',
        'TABLE_HEADER_MATCH',
        'TABLE_ROW_MATCH',
        'DOCUMENT_TYPE_SIGNAL',
        'ENTITY_RELATIONSHIP',
        'LANGUAGE_SIGNAL',
        'SCRIPT_SIGNAL',
        'STRUCTURAL_SIGNAL',
        'NEGATIVE_CONTEXT_SIGNAL',
        'AMBIGUITY_SIGNAL',
      ],
      required: true,
    },
    weight: { type: Number, required: true },
    provenance: { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const contextResultSchema = new Schema<IContextResult>(
  {
    contextResultId: { type: String, required: true, unique: true, index: true },
    contextAnalysisRunId: { type: String, required: true, index: true },
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
    contextWindow: { type: contextWindowSchema, required: true },
    semanticRole: {
      type: String,
      enum: [
        'PERSON_NAME',
        'CONTACT_FIELD',
        'IDENTIFIER_FIELD',
        'FINANCIAL_FIELD',
        'ADDRESS_FIELD',
        'DATE_FIELD',
        'SECURITY_CREDENTIAL_FIELD',
        'LOCATION_FIELD',
        'FREE_TEXT',
        'UNKNOWN',
      ],
      required: true,
    },
    documentSection: { type: documentSectionSchema },
    fieldLabel: { type: String, default: null },
    nearbyKeywords: { type: [String], default: [] },
    structuralContext: { type: structuralContextSchema, required: true },
    relationshipEvidence: { type: [relationshipEvidenceSchema], default: [] },
    contextSignals: { type: [contextSignalSchema], default: [] },
    contextualScore: { type: Number, required: true, min: 0, max: 1 },
    ambiguityIndicators: {
      type: [String],
      enum: [
        'AMBIGUOUS_LABEL',
        'WEAK_CONTEXT',
        'CONFLICTING_CONTEXT',
        'MULTIPLE_SEMANTIC_INTERPRETATIONS',
        'INSUFFICIENT_CONTEXT',
      ],
      default: [],
    },
    language: { type: String, default: 'en' },
    script: { type: String, default: 'Latin' },
    contextWarnings: { type: [String], default: [] },
    analyzerVersion: { type: String, required: true, default: '1.0.0' },
    decision: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

contextResultSchema.index({ organizationId: 1, documentId: 1, contextAnalysisRunId: 1 });
contextResultSchema.index({ contextAnalysisRunId: 1, candidateId: 1 }, { unique: true });

export const ContextResultModel = mongoose.model<IContextResult>(
  'ContextResult',
  contextResultSchema
);
