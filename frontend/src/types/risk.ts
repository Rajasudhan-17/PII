export type ReidentificationRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'CRITICAL';
export type ReidentificationRiskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

// Backward compatibility alias
export type RiskLevel = ReidentificationRiskLevel;

export interface ReidentificationRiskWarning {
  code: string;
  message: string;
}

export interface ReidentificationRiskRun {
  _id?: string;
  riskRunId: string;
  organizationId: string;
  documentId: string;
  sourceArtifactId?: string;
  sanitizedArtifactId?: string;
  metadataSanitizationRunId?: string | null;
  sourceChecksum?: string;
  sanitizedChecksum?: string;
  configurationVersion?: string;
  configurationHash?: string;
  riskModelVersion?: string;
  referencePopulationVersion?: string;
  status: ReidentificationRiskStatus;
  isLatestActive?: boolean;

  reidentificationRiskScore: number; // 0.00 to 1.00
  riskLevel: ReidentificationRiskLevel;
  riskConfidence: number; // 0.00 to 1.00

  // Dimension Risk Scores
  directIdentifierRiskScore?: number | null;
  quasiIdentifierRiskScore?: number | null;
  uniquenessRiskScore?: number | null;
  combinationRiskScore?: number | null;
  geographicRiskScore?: number | null;
  temporalRiskScore?: number | null;
  linkageRiskScore?: number | null;
  rarityRiskScore?: number | null;
  attributeSensitivityRiskScore?: number | null;

  discoveredAttributeCount: number;
  combinationEvaluatedCount: number;
  warnings: ReidentificationRiskWarning[];
  startedAt?: string;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// Backward compatibility alias
export type RiskAnalysisRun = ReidentificationRiskRun;

export interface RiskAnalysisResponse {
  success: boolean;
  data: {
    riskRun: ReidentificationRiskRun | null;
    results?: unknown[];
  };
}

export interface RiskRunsResponse {
  success: boolean;
  data: {
    riskRuns?: ReidentificationRiskRun[];
    runs?: ReidentificationRiskRun[];
  };
}
