import React from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  FileText,
  SearchCode,
  UserCheck,
  ShieldAlert,
  CheckCircle,
  FileCheck,
  Settings,
  Activity,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Permission } from '../../types/auth';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onMobileClose?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  requiredPermission?: Permission;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  onMobileClose,
}) => {
  const { hasPermission, user } = useAuth();

  const navItems: NavItem[] = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      to: '/documents',
      label: 'Documents',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      requiredPermission: 'DOCUMENT_READ',
    },
    {
      to: '/findings',
      label: 'Findings & Decisions',
      icon: <SearchCode className="w-4 h-4 shrink-0" />,
      requiredPermission: 'DECISION_READ',
    },
    {
      to: '/human-review',
      label: 'Human Review',
      icon: <UserCheck className="w-4 h-4 shrink-0" />,
      requiredPermission: 'REVIEW_READ',
    },
    {
      to: '/policies',
      label: 'Policies',
      icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
      requiredPermission: 'POLICY_READ',
    },
    {
      to: '/verification',
      label: 'Risk & Verification',
      icon: <CheckCircle className="w-4 h-4 shrink-0" />,
      requiredPermission: 'VERIFICATION_READ',
    },
    {
      to: '/audit-logs',
      label: 'Audit Logs',
      icon: <FileCheck className="w-4 h-4 shrink-0" />,
      requiredPermission: 'ANALYTICS_READ',
    },
    {
      to: '/system-health',
      label: 'System Health',
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4 shrink-0" />,
    },
  ];

  // Filter items according to permissions
  const visibleItems = navItems.filter((item) => {
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission);
  });

  return (
    <aside
      className={clsx(
        'h-screen flex flex-col bg-brand-deep-teal text-surface-white border-r border-slate-700/50 transition-all duration-200 select-none z-30 shrink-0',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700/40">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center shrink-0 shadow-sm text-surface-white">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-tight text-surface-white">
                Intelligent PII
              </span>
              <span className="text-[10px] text-teal-200/80 font-medium tracking-wider uppercase">
                Privacy Platform
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden md:flex p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto scrollbar-none">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onMobileClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors group relative',
                isActive
                  ? 'bg-brand-teal text-white shadow-subtle'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              )
            }
            title={isCollapsed ? item.label : undefined}
          >
            {item.icon}
            {!isCollapsed && <span className="truncate">{item.label}</span>}
            {isCollapsed && (
              <span className="sr-only">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Status Footer */}
      <div className="p-3 border-t border-slate-700/40 bg-black/10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-brand-pale-teal text-brand-deep-teal font-bold text-xs flex items-center justify-center shrink-0">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-xs font-medium text-white truncate">{user?.email}</span>
              <span className="text-[10px] text-teal-200 uppercase tracking-wider font-semibold">
                {user?.role || 'VIEWER'}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
