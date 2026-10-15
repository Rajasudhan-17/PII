import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CheckCircle2, AlertTriangle, AlertCircle, Clock, Info, ShieldAlert } from 'lucide-react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'critical'
  | 'info'
  | 'neutral'
  | 'teal';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  showDefaultIcon?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  size = 'md',
  icon,
  showDefaultIcon = true,
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center font-medium rounded-full border transition-colors select-none tabular-nums';

  const variants = {
    success: 'bg-status-success-bg text-status-success border-status-success-border',
    warning: 'bg-status-warning-bg text-status-warning border-status-warning-border',
    critical: 'bg-status-critical-bg text-status-critical border-status-critical-border',
    info: 'bg-status-info-bg text-brand-teal-dark border-status-info-border',
    teal: 'bg-brand-pale-teal text-brand-deep-teal border-teal-200',
    neutral: 'bg-slate-100 text-text-secondary border-surface-border',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
  };

  const defaultIcons = {
    success: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    critical: <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    info: <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    teal: <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    neutral: <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
  };

  const iconToRender = icon || (showDefaultIcon ? defaultIcons[variant] : null);

  return (
    <span className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))} {...props}>
      {iconToRender && <span className="shrink-0">{iconToRender}</span>}
      <span>{children}</span>
    </span>
  );
};
