import React, { useState, useMemo } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { AuditTaxonomyDrawer } from '../components/audit/AuditTaxonomyDrawer';
import { AUDIT_EVENT_TAXONOMY } from '../api/audit.api';
import { AuditEventTaxonomyItem } from '../types/audit';
import { useAuth } from '../context/AuthContext';
import {
  FileCheck,
  Shield,
  Lock,
  Search,
  ExternalLink,
  Terminal,
  Filter,
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { currentOrgId, organizations, hasPermission } = useAuth();
  const activeOrgId = currentOrgId || organizations[0]?.id || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedItem, setSelectedItem] = useState<AuditEventTaxonomyItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Derive unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(AUDIT_EVENT_TAXONOMY.map((item) => item.category)));
    return ['ALL', ...cats];
  }, []);

  // Filter taxonomy items
  const filteredItems = useMemo(() => {
    return AUDIT_EVENT_TAXONOMY.filter((item) => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        item.event.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.complianceRelevance.toLowerCase().includes(term) ||
        item.phase.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory]);

  const handleInspect = (item: AuditEventTaxonomyItem) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  };

  if (!hasPermission('ANALYTICS_READ')) {
    return (
      <div>
        <PageHeader title="Compliance & Security Audit Trail" />
        <Alert variant="warning" title="Access Restricted">
          Your role does not possess the ANALYTICS_READ permission required to view system compliance audit logs.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance & Security Audit Trail"
        description="Enterprise SIEM event streaming taxonomy, immutable audit architecture, and compliance mappings."
        badge={
          <Badge variant="teal" size="sm">
            SIEM Streaming Architecture
          </Badge>
        }
      />

      {/* Security Architecture Guarantees */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Zero Raw PII Guarantee</CardTitle>
              <Lock className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Security invariant</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="success" size="sm">Enforced</Badge>
            <p className="text-[11px] text-text-secondary mt-2">
              All logged events store cryptographic SHA-256 hashes and entity IDs only; raw sensitive tokens are never persisted in logs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Tenant Scope Isolation</CardTitle>
              <Shield className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Organization boundaries</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-xs font-semibold text-text-primary">
              {activeOrgId}
            </span>
            <p className="text-[11px] text-text-secondary mt-2">
              Cross-tenant boundary queries are strictly forbidden. All emitted events carry authoritative organization tenancy tags.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Immutable SIEM Stream</CardTitle>
              <FileCheck className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Append-only ledger</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="info" size="sm">Append-Only Design</Badge>
            <p className="text-[11px] text-text-secondary mt-2">
              Structured JSON events are emitted via Pino logger to standard output, architected for ingestion by container log forwarders and enterprise SIEM collectors.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Enterprise SIEM Disclosure Alert */}
      <Alert variant="info" title="Standard Output Logging Architecture">
        Audit events are written as structured JSON directly to standard output (Pino logger) by backend audit services rather than stored in a mutable application database. In production deployments, external log forwarders (e.g. FluentBit, Datadog Agent, CloudWatch) capture this stdout stream for SIEM ingestion. The taxonomy and regulatory mappings below document the event catalog and its design relevance to compliance frameworks (e.g. SOC 2, ISO 27001, HIPAA) according to platform specifications.
      </Alert>

      {/* Taxonomy Explorer Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-teal" />
                Active Audit Event Taxonomy Explorer
              </CardTitle>
              <CardDescription>
                Authoritative event definitions, compliance frameworks (SOC 2, ISO 27001, HIPAA, GDPR, EU AI Act), and JSON payload schemas.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="font-semibold text-brand-deep-teal">{filteredItems.length}</span> of{' '}
              <span className="font-semibold text-text-primary">{AUDIT_EVENT_TAXONOMY.length}</span> event types
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by event type, regulation (e.g. SOC 2, HIPAA), or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-text-secondary" />}
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <Filter className="w-4 h-4 text-text-secondary shrink-0" />
              <select
                aria-label="Filter by Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 px-3 rounded-md border border-surface-border text-xs text-text-primary bg-surface-white focus:outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results Table */}
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={<Search className="w-6 h-6 text-text-muted" />}
              title="No audit event definitions match your query"
              description="Try adjusting your search terms or category filter to discover platform audit events."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-surface-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-cool text-text-secondary font-semibold border-b border-surface-border">
                  <tr>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Category & Lifecycle</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Compliance Relevance</th>
                    <th className="py-3 px-4 text-right">Schema</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-surface-white">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.event}
                      className="hover:bg-brand-pale-teal/20 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-brand-deep-teal">
                        {item.event}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-text-primary">{item.category}</span>
                          <span className="text-[10px] text-text-muted">{item.phase}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-text-secondary max-w-xs">
                        {item.description}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-brand-teal font-medium max-w-xs">
                        {item.complianceRelevance}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInspect(item)}
                          className="h-7 text-xs flex items-center gap-1 ml-auto"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schema Inspection Drawer */}
      <AuditTaxonomyDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedItem(null);
        }}
        item={selectedItem}
      />
    </div>
  );
};
