import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ReidentificationRiskRun } from '../../types/risk';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, AlertTriangle, RefreshCw, Database } from 'lucide-react';

interface RiskAssessmentViewProps {
  riskRun: ReidentificationRiskRun | null;
  isEvaluating: boolean;
  onExecuteRiskAnalysis: () => void;
}

export const RiskAssessmentView: React.FC<RiskAssessmentViewProps> = ({
  riskRun,
  isEvaluating,
  onExecuteRiskAnalysis,
}) => {
  const { hasPermission } = useAuth();

  const renderRiskBadge = (level?: string) => {
    switch (level) {
      case 'CRITICAL':
        return <Badge variant="critical">CRITICAL RISK</Badge>;
      case 'VERY_HIGH':
      case 'HIGH':
        return <Badge variant="critical">{level} RISK</Badge>;
      case 'MODERATE':
        return <Badge variant="warning">MODERATE RISK</Badge>;
      case 'LOW':
        return <Badge variant="success">LOW RISK</Badge>;
      default:
        return <Badge variant="neutral">NOT EVALUATED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-brand-teal" />
                Re-Identification Risk Profile
              </CardTitle>
              <CardDescription>
                Multi-dimensional probabilistic scoring of residual linkage and uniqueness risks.
              </CardDescription>
            </div>
            {hasPermission('RISK_EXECUTE') && (
              <Button
                variant="primary"
                size="sm"
                onClick={onExecuteRiskAnalysis}
                isLoading={isEvaluating}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Execute Risk Analysis
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {!riskRun ? (
            <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-lg bg-surface-cool/30">
              <ShieldAlert className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm font-semibold text-text-primary">
                Risk assessment has not been evaluated for this document
              </p>
              <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                Trigger risk evaluation downstream of redaction to measure residual quasi-identifier
                combinations and uniqueness probabilities.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overall Score Banner */}
              <div className="p-4 rounded-lg bg-surface-cool border border-surface-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-text-muted font-medium uppercase tracking-wider block">
                    Composite Re-Identification Risk
                  </span>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-3xl font-extrabold text-brand-deep-teal tabular-nums">
                      {(riskRun.reidentificationRiskScore * 100).toFixed(2)}%
                    </span>
                    <span className="text-xs text-text-secondary">
                      (raw index: {riskRun.reidentificationRiskScore.toFixed(4)})
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {renderRiskBadge(riskRun.riskLevel)}
                  <span className="text-[11px] text-text-secondary tabular-nums">
                    Confidence: {(riskRun.riskConfidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Methodology Indicator */}
              <div className="flex items-center gap-2 p-2.5 rounded bg-surface-white border border-surface-border text-xs text-text-secondary">
                <Database className="w-4 h-4 text-brand-teal shrink-0" />
                <span>
                  <strong>Methodology:</strong> Reference Population Version:{' '}
                  <code>{riskRun.referencePopulationVersion || 'N/A'}</code> | Risk Model:{' '}
                  <code>{riskRun.riskModelVersion || '1.0.0'}</code>
                </span>
              </div>

              {/* Warnings & Dependencies */}
              {riskRun.warnings && riskRun.warnings.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-text-primary">
                    Residual Direct Identifiers & Assessment Warnings:
                  </span>
                  {riskRun.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>[{w.code}]:</strong> {w.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 9-Dimension Risk Factor Breakdown */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-brand-deep-teal">
                  Risk Dimension Breakdown (Normalized 0.00–1.00)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: 'Direct Identifier', score: riskRun.directIdentifierRiskScore },
                    { label: 'Quasi-Identifier', score: riskRun.quasiIdentifierRiskScore },
                    { label: 'Uniqueness Risk', score: riskRun.uniquenessRiskScore },
                    { label: 'Combination Risk', score: riskRun.combinationRiskScore },
                    { label: 'Geographic Linkage', score: riskRun.geographicRiskScore },
                    { label: 'Temporal Linkage', score: riskRun.temporalRiskScore },
                    { label: 'External Linkage', score: riskRun.linkageRiskScore },
                    { label: 'Population Rarity', score: riskRun.rarityRiskScore },
                    { label: 'Attribute Sensitivity', score: riskRun.attributeSensitivityRiskScore },
                  ].map((dim) => (
                    <div
                      key={dim.label}
                      className="p-3 rounded border border-surface-border bg-surface-white shadow-subtle space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] text-text-secondary">
                        <span>{dim.label}</span>
                        <span className="font-bold tabular-nums text-brand-deep-teal">
                          {typeof dim.score === 'number' ? (dim.score * 100).toFixed(1) + '%' : 'N/A'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            (dim.score ?? 0) > 0.6
                              ? 'bg-status-critical'
                              : (dim.score ?? 0) > 0.3
                                ? 'bg-status-warning'
                                : 'bg-status-success'
                          }`}
                          style={{ width: `${Math.min(100, (dim.score || 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
