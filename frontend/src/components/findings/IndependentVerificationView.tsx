import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { VerificationRun, VerificationResultItem } from '../../types/verification';
import { useAuth } from '../../context/AuthContext';
import { RefreshCw, ShieldCheck, FileCheck2 } from 'lucide-react';

interface IndependentVerificationViewProps {
  verificationRun: VerificationRun | null;
  results: VerificationResultItem[];
  isVerifying: boolean;
  onExecuteVerification: () => void;
}

export const IndependentVerificationView: React.FC<IndependentVerificationViewProps> = ({
  verificationRun,
  results,
  isVerifying,
  onExecuteVerification,
}) => {
  const { hasPermission } = useAuth();

  const renderStatusBadge = (status?: string | null) => {
    switch (status) {
      case 'VERIFIED':
        return <Badge variant="success">VERIFIED</Badge>;
      case 'PARTIAL':
        return <Badge variant="warning">PARTIAL</Badge>;
      case 'FAILED':
        return <Badge variant="critical">FAILED</Badge>;
      case 'NOT_VERIFIABLE':
        return <Badge variant="neutral">NOT VERIFIABLE</Badge>;
      default:
        return <Badge variant="neutral">NOT EVALUATED</Badge>;
    }
  };

  const renderSeverityBadge = (severity?: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return <Badge variant="critical">{severity}</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning">MEDIUM</Badge>;
      case 'LOW':
      case 'INFO':
      default:
        return <Badge variant="neutral">{severity || 'INFO'}</Badge>;
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
                <ShieldCheck className="w-5 h-5 text-brand-teal" />
                9-Verifier Independent Verification & QA
              </CardTitle>
              <CardDescription>
                Post-transformation multi-engine inspection verifying checksum, metadata stripping,
                and residual PII absence.
              </CardDescription>
            </div>
            {hasPermission('VERIFICATION_EXECUTE') && (
              <Button
                variant="primary"
                size="sm"
                onClick={onExecuteVerification}
                isLoading={isVerifying}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Execute Verification QA
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {!verificationRun ? (
            <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-lg bg-surface-cool/30">
              <FileCheck2 className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm font-semibold text-text-primary">
                Independent verification has not been executed
              </p>
              <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                Execute verification QA downstream of transformations to validate that the output
                artifact adheres strictly to tenant policies and contains no residual sensitive identifiers.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* QA Metric Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded border border-surface-border bg-surface-cool">
                  <span className="text-text-muted block text-[11px]">Overall Outcome</span>
                  <div className="mt-1">{renderStatusBadge(verificationRun.overallStatus)}</div>
                </div>

                <div className="p-3 rounded border border-surface-border bg-surface-cool">
                  <span className="text-text-muted block text-[11px]">Overall QA Score</span>
                  <span className="text-xl font-bold text-brand-deep-teal mt-1 block tabular-nums">
                    {(verificationRun.overallVerificationScore * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="p-3 rounded border border-surface-border bg-surface-cool">
                  <span className="text-text-muted block text-[11px]">Passed Verifiers</span>
                  <span className="text-xl font-bold text-status-success mt-1 block tabular-nums">
                    {verificationRun.passedVerifierCount} / {verificationRun.totalVerifierCount}
                  </span>
                </div>

                <div className="p-3 rounded border border-surface-border bg-surface-cool">
                  <span className="text-text-muted block text-[11px]">Failed / Unverifiable</span>
                  <span className="text-xl font-bold text-status-critical mt-1 block tabular-nums">
                    {verificationRun.failedVerifierCount + verificationRun.unverifiableCount}
                  </span>
                </div>
              </div>

              {/* Discrepancies & Verifier Table */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-brand-deep-teal">
                  Individual Verifier Results & Evidence
                </span>
                <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Verifier Engine</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Reason Code</TableHead>
                        <TableHead>Explanation</TableHead>
                        <TableHead>Discrepancy (Observed vs Expected)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-text-secondary text-xs">
                            No individual verifier records returned.
                          </TableCell>
                        </TableRow>
                      ) : (
                        results.map((r) => (
                          <TableRow key={r.verificationResultId || r.verifierType}>
                            <TableCell className="font-semibold text-brand-deep-teal text-xs">
                              <span className="font-mono">{r.verifierType}</span>
                            </TableCell>
                            <TableCell>{renderStatusBadge(r.status)}</TableCell>
                            <TableCell>{renderSeverityBadge(r.severity)}</TableCell>
                            <TableCell className="font-mono text-[11px] text-text-secondary">
                              {r.reasonCode}
                            </TableCell>
                            <TableCell className="text-xs text-text-primary max-w-xs">
                              {r.explanation}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-text-secondary">
                              {r.observed || r.expected ? (
                                <div className="space-y-0.5">
                                  {r.expected && (
                                    <div className="text-status-success">
                                      Expected: {r.expected}
                                    </div>
                                  )}
                                  {r.observed && (
                                    <div className="text-status-critical">
                                      Observed: {r.observed}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
