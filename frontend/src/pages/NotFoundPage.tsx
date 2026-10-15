import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-cool flex flex-col justify-center items-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-pale-teal text-brand-teal flex items-center justify-center mb-4">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-extrabold text-brand-deep-teal tracking-tight">404</h1>
      <h2 className="text-base font-semibold text-text-primary mt-1">Resource Not Found</h2>
      <p className="text-xs text-text-secondary max-w-sm mt-2 mb-6 leading-relaxed">
        The requested URL does not correspond to an active route within this platform tenant.
      </p>
      <Link to="/dashboard">
        <Button variant="primary" size="md" leftIcon={<ArrowLeft className="w-4 h-4" />}>
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
};
