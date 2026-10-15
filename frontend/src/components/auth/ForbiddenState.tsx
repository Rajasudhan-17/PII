import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

export interface ForbiddenStateProps {
  requiredPermission?: string;
  requiredRoles?: string[];
}

export const ForbiddenState: React.FC<ForbiddenStateProps> = ({
  requiredPermission,
  requiredRoles,
}) => {
  const { user } = useAuth();

  return (
    <div className="min-h-[60vh] flex flex-col justify-center items-center p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-status-warning-bg text-status-warning flex items-center justify-center mb-4 border border-status-warning-border">
        <ShieldAlert className="w-7 h-7" />
      </div>

      <h1 className="text-2xl font-bold text-brand-deep-teal tracking-tight">403 — Access Denied</h1>
      <h2 className="text-sm font-semibold text-text-primary mt-1">Insufficient Role Privileges</h2>

      <p className="text-xs text-text-secondary max-w-md mt-2 mb-4 leading-relaxed">
        Your current tenant role (<strong className="text-brand-deep-teal">{user?.role || 'VIEWER'}</strong>) does not have authorization to view this section.
      </p>

      {(requiredPermission || (requiredRoles && requiredRoles.length > 0)) && (
        <div className="mb-6 p-3 rounded-lg bg-surface-white border border-surface-border text-xs text-left max-w-sm w-full">
          {requiredPermission && (
            <div className="flex items-center justify-between py-1">
              <span className="text-text-secondary">Required Permission:</span>
              <code className="text-brand-teal font-mono text-[11px] font-semibold">
                {requiredPermission}
              </code>
            </div>
          )}
          {requiredRoles && requiredRoles.length > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-text-secondary">Permitted Roles:</span>
              <span className="text-brand-deep-teal font-medium text-[11px]">
                {requiredRoles.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link to="/dashboard">
          <Button variant="primary" size="md" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};
