import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'critical';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onDismiss,
  className,
}) => {
  const variants = {
    info: 'bg-status-info-bg border-status-info-border text-brand-deep-teal',
    success: 'bg-status-success-bg border-status-success-border text-status-success',
    warning: 'bg-status-warning-bg border-status-warning-border text-status-warning',
    critical: 'bg-status-critical-bg border-status-critical-border text-status-critical',
  };

  const icons = {
    info: <Info className="w-4 h-4 shrink-0 text-brand-teal" />,
    success: <CheckCircle2 className="w-4 h-4 shrink-0 text-status-success" />,
    warning: <AlertTriangle className="w-4 h-4 shrink-0 text-status-warning" />,
    critical: <AlertCircle className="w-4 h-4 shrink-0 text-status-critical" />,
  };

  return (
    <div
      role="alert"
      className={twMerge(
        clsx(
          'flex items-start gap-3 p-4 rounded-lg border text-xs',
          variants[variant],
          className
        )
      )}
    >
      <div className="mt-0.5">{icons[variant]}</div>
      <div className="flex-1">
        {title && <h4 className="font-semibold text-text-primary mb-0.5">{title}</h4>}
        <div className="text-text-primary/90 leading-relaxed">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-secondary hover:text-text-primary p-0.5 rounded transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
