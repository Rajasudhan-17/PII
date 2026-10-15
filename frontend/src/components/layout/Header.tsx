import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Menu, LogOut, ChevronRight, Building, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface HeaderProps {
  onMobileMenuOpen: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  documents: 'Documents',
  findings: 'Findings & Decisions',
  'human-review': 'Human Review',
  policies: 'Policies',
  verification: 'Risk & Verification',
  'audit-logs': 'Audit Logs',
  settings: 'Settings',
};

export const Header: React.FC<HeaderProps> = ({ onMobileMenuOpen }) => {
  const { user, logout, currentOrgId, setCurrentOrgId, organizations } = useAuth();
  const location = useLocation();

  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <header className="h-16 bg-surface-white border-b border-surface-border px-4 lg:px-6 flex items-center justify-between sticky top-0 z-20 select-none">
      {/* Left Section: Mobile Menu + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMobileMenuOpen}
          className="md:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center text-xs font-medium text-text-secondary">
          <Link to="/dashboard" className="hover:text-brand-teal transition-colors">
            Platform
          </Link>
          {pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
            const label = ROUTE_LABELS[segment] || segment;

            return (
              <React.Fragment key={path}>
                <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400" />
                {isLast ? (
                  <span className="text-brand-deep-teal font-semibold">{label}</span>
                ) : (
                  <Link to={path} className="hover:text-brand-teal transition-colors">
                    {label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right Section: Organization Scope + Role Badge + Account Controls */}
      <div className="flex items-center gap-3">
        {/* Organization Tenant Selector */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-cool border border-surface-border text-xs">
          <Building className="w-3.5 h-3.5 text-text-secondary" />
          <span className="font-semibold text-text-primary">Tenant:</span>
          {organizations.length > 0 ? (
            <select
              value={currentOrgId || ''}
              onChange={(e) => setCurrentOrgId(e.target.value)}
              className="bg-transparent font-medium text-brand-deep-teal focus:outline-none cursor-pointer max-w-[160px] truncate"
              aria-label="Active Tenant"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-mono text-text-muted text-[11px]">
              {currentOrgId || 'No Tenant'}
            </span>
          )}
        </div>

        {/* User Role Badge */}
        {user?.role && (
          <div className="hidden md:block">
            <Badge variant="teal" size="sm" showDefaultIcon={false} icon={<User className="w-3 h-3" />}>
              {user.role}
            </Badge>
          </div>
        )}

        {/* Logout Action */}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          leftIcon={<LogOut className="w-3.5 h-3.5" />}
          className="text-xs"
        >
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
};
