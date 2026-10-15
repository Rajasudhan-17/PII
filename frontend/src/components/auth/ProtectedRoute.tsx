import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Permission, UserRole } from '../../types/auth';
import { ForbiddenState } from './ForbiddenState';
import { Skeleton } from '../ui/Skeleton';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
  requiredRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRoles,
}) => {
  const { isAuthenticated, isLoading, hasPermission, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-surface-cool gap-3">
        <Skeleton variant="circular" width={48} height={48} />
        <p className="text-xs text-text-secondary animate-pulse font-medium">
          Verifying security credentials...
        </p>
      </div>
    );
  }

  // Not authenticated -> redirect to login preserving intended target
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role check
  if (requiredRoles && requiredRoles.length > 0 && !hasRole(...requiredRoles)) {
    return <ForbiddenState requiredRoles={requiredRoles} />;
  }

  // Permission check
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <ForbiddenState requiredPermission={requiredPermission} />;
  }

  return <>{children}</>;
};
