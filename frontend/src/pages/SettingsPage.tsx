import React from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { Cpu, User, Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SettingsPage: React.FC = () => {
  const { user, currentOrgId } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform & Tenant Settings"
        description="Review active user credentials, organization bindings, hardware runtime boundaries, and system health status."
        badge={
          <Badge variant="teal" size="sm">
            Platform Configuration
          </Badge>
        }
        actions={
          <Link to="/system-health">
            <Button variant="outline" size="sm" leftIcon={<Activity className="w-3.5 h-3.5" />}>
              Operational System Health
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Account Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>User Profile & Security</CardTitle>
              <User className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Current authenticated session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <span className="text-text-secondary">Email Address:</span>
                <span className="font-semibold text-text-primary font-mono">{user?.email || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <span className="text-text-secondary">Assigned Role:</span>
                <Badge variant="teal" size="sm">{user?.role || 'VIEWER'}</Badge>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <span className="text-text-secondary">Account Status:</span>
                <Badge variant="success" size="sm">{user?.status || 'ACTIVE'}</Badge>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-text-secondary">Active Tenant:</span>
                <span className="font-mono font-medium text-brand-deep-teal">{currentOrgId || 'org_primary'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Capabilities & Modality Honest Boundaries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Modality Engine Capabilities</CardTitle>
              <Cpu className="w-4 h-4 text-brand-teal" />
            </div>
            <CardDescription>Document, image, handwriting, and audio bounds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">Tesseract OCR</span>
                  <span className="text-[11px] text-text-secondary">Node.js worker raster extraction</span>
                </div>
                <Badge variant="success" size="sm">Available</Badge>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">TrOCR Handwriting HTR</span>
                  <span className="text-[11px] text-text-secondary">microsoft/trocr-base-handwritten</span>
                </div>
                <Badge variant="warning" size="sm">Offline Weights (HTR_UNAVAILABLE)</Badge>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-surface-border">
                <div>
                  <span className="font-semibold text-text-primary block">Speech-to-Text (STT)</span>
                  <span className="text-[11px] text-text-secondary">Synthetic fixture mode</span>
                </div>
                <Badge variant="info" size="sm">Deterministic Fixture</Badge>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <div>
                  <span className="font-semibold text-text-primary block">File Size Upload Limit</span>
                  <span className="text-[11px] text-text-secondary">Configured in MAX_UPLOAD_SIZE_BYTES</span>
                </div>
                <span className="font-mono text-text-primary">10 MB</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational System Health Quick Jump Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-teal" />
              Diagnostics & Operational Readiness
            </CardTitle>
            <Badge variant="info" size="sm">Live Probes</Badge>
          </div>
          <CardDescription>
            Inspect live backend liveness, readiness, MongoDB and Redis connection state, and runtime metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-surface-cool border border-surface-border">
            <div className="text-xs text-text-secondary">
              <strong className="text-text-primary block">Real-Time Probe Visibility</strong>
              <span>
                Validate Express backend health status, database persistence connectivity, and queue readiness without exposing internal secrets or credentials.
              </span>
            </div>
            <Link to="/system-health">
              <Button variant="primary" size="sm" className="whitespace-nowrap flex items-center gap-1.5 text-xs">
                Open System Health <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
