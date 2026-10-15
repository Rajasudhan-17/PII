import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { PolicyDetailsDrawer } from '../components/policies/PolicyDetailsDrawer';
import { CreatePolicyModal } from '../components/policies/CreatePolicyModal';
import { CreatePolicyVersionModal } from '../components/policies/CreatePolicyVersionModal';
import { policiesApi } from '../api/policies.api';
import { useAuth } from '../context/AuthContext';
import { Policy } from '../types/policy';
import { Shield, Plus, RefreshCw, Hash, Search } from 'lucide-react';

export const PoliciesPage: React.FC = () => {
  const { currentOrgId, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || 'org_primary';

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [selectedPolicyVersions, setSelectedPolicyVersions] = useState<Policy[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateVersionModalOpen, setIsCreateVersionModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const activeOrgIdRef = useRef(activeOrgId);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  // Load Policies from Backend
  const loadPolicies = useCallback(async () => {
    const currentGen = ++fetchGenerationRef.current;
    const targetOrg = activeOrgId;

    setIsLoading(true);
    setErrorNotice(null);

    try {
      const res = await policiesApi.listPolicies(targetOrg);

      if (currentGen !== fetchGenerationRef.current || activeOrgIdRef.current !== targetOrg) {
        return;
      }

      setPolicies(res.data?.policies || []);
    } catch (err: unknown) {
      if (currentGen === fetchGenerationRef.current) {
        setErrorNotice(err instanceof Error ? err.message : 'Failed to query tenant policies');
      }
    } finally {
      if (currentGen === fetchGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeOrgId]);

  // Flush state when organization switches
  useEffect(() => {
    setPolicies([]);
    setSelectedPolicy(null);
    setSelectedPolicyVersions([]);
    setIsDrawerOpen(false);
    setIsCreateModalOpen(false);
    setIsCreateVersionModalOpen(false);
    setErrorNotice(null);
    setSuccessBanner(null);

    loadPolicies();
  }, [activeOrgId, loadPolicies]);

  // Inspect policy details and fetch all historical versions
  const handleInspectPolicy = async (policy: Policy) => {
    setSelectedPolicy(policy);
    setSelectedPolicyVersions([policy]);
    setIsDrawerOpen(true);

    try {
      const res = await policiesApi.getPolicy(activeOrgId, policy.policyId);
      if (res.data?.versions) {
        setSelectedPolicyVersions(res.data.versions);
        if (res.data.latestVersion) {
          setSelectedPolicy(res.data.latestVersion);
        }
      }
    } catch {
      // Retain already selected policy item
    }
  };

  const handlePolicyCreated = () => {
    setSuccessBanner('New policy successfully provisioned and published.');
    loadPolicies();
  };

  const handleVersionCreated = () => {
    setSuccessBanner('New policy version published successfully.');
    setIsDrawerOpen(false);
    loadPolicies();
  };

  // Filtered policies
  const filteredPolicies = policies.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.policyId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy Policies & Rules"
        description="Configure tenant-scoped priority rules, threshold overrides, and deterministic redaction policies."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPolicies}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {hasPermission('POLICY_MANAGE') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Create Policy
              </Button>
            )}
          </div>
        }
      />

      {successBanner && (
        <Alert variant="success" title="Success" onDismiss={() => setSuccessBanner(null)}>
          {successBanner}
        </Alert>
      )}

      {errorNotice && (
        <Alert variant="info" title="Policy Notice" onDismiss={() => setErrorNotice(null)}>
          {errorNotice}. Organization [{activeOrgId}] is using default fallback decision contracts.
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-lg bg-surface-white border border-surface-border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
          <Input
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            placeholder="Search policies by name, description, or policy ID..."
            className="pl-9 h-9"
          />
        </div>

        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'PUBLISHED', label: 'PUBLISHED' },
              { value: 'DRAFT', label: 'DRAFT' },
              { value: 'ARCHIVED', label: 'ARCHIVED' },
            ]}
          />
        </div>
      </div>

      {/* Policies Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      ) : filteredPolicies.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-8 h-8 text-brand-teal" />}
          title={policies.length === 0 ? 'No custom tenant policies defined' : 'No policies match search'}
          description={
            policies.length === 0
              ? `Organization [${activeOrgId}] currently inherits the system defaults: Direct identifiers (SSN, Email, Phone, Financial IDs) evaluate to REDACT; ambiguous entities evaluate to REVIEW.`
              : 'Try clearing your search query or status filter.'
          }
          action={
            policies.length === 0 && hasPermission('POLICY_MANAGE') ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Create First Policy
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredPolicies.map((p) => (
            <Card key={`${p.policyId}_v${p.version}`} className="hover:border-slate-300 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brand-teal" />
                      {p.name}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Version <strong className="font-mono text-brand-deep-teal">v{p.version}</strong> • ID: <code className="font-mono text-[11px]">{p.policyId}</code>
                    </CardDescription>
                  </div>
                  <Badge variant={p.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {p.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-text-secondary line-clamp-2 leading-relaxed">
                  {p.description || 'Configured deterministic rule engine with priority-based conflict breaking.'}
                </p>

                <div className="grid grid-cols-2 gap-2 p-2 rounded bg-surface-cool text-[11px]">
                  <div>
                    <span className="text-text-muted block text-[10px]">Default Action:</span>
                    <Badge
                      variant={
                        p.defaultDecision === 'REDACT'
                          ? 'critical'
                          : p.defaultDecision === 'REVIEW'
                            ? 'warning'
                            : 'success'
                      }
                      size="sm"
                    >
                      {p.defaultDecision}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Rules Configured:</span>
                    <span className="font-semibold text-text-primary tabular-nums">
                      {p.rules?.length || 0} rule(s)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-surface-border">
                  <span className="text-[10px] text-text-muted font-mono truncate max-w-[180px]" title={p.configurationHash}>
                    <Hash className="w-3 h-3 inline mr-0.5 text-text-muted" />
                    {p.configurationHash || 'N/A'}
                  </span>

                  <div className="flex items-center gap-2">
                    {hasPermission('POLICY_MANAGE') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => {
                          setSelectedPolicy(p);
                          setIsCreateVersionModalOpen(true);
                        }}
                      >
                        New Version
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => handleInspectPolicy(p)}
                    >
                      View Rules
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Policy Details Drawer */}
      <PolicyDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        policy={selectedPolicy}
        versions={selectedPolicyVersions}
        hasPolicyManage={hasPermission('POLICY_MANAGE')}
        onOpenCreateVersionModal={() => {
          setIsDrawerOpen(false);
          setIsCreateVersionModalOpen(true);
        }}
      />

      {/* Create Policy Modal */}
      <CreatePolicyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        organizationId={activeOrgId}
        onSuccess={handlePolicyCreated}
      />

      {/* Create Policy Version Modal */}
      <CreatePolicyVersionModal
        isOpen={isCreateVersionModalOpen}
        onClose={() => setIsCreateVersionModalOpen(false)}
        organizationId={activeOrgId}
        basePolicy={selectedPolicy}
        onSuccess={handleVersionCreated}
      />
    </div>
  );
};
