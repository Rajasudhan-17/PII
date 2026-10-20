import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RedactProvider } from './context/RedactContext';
import { Navbar } from './components/redact/Navbar';
import { NewRedactionPage } from './pages/NewRedactionPage';
import { ReviewWorkspacePage } from './pages/ReviewWorkspacePage';
import { VerifyExportPage } from './pages/VerifyExportPage';
import { HistoryPage } from './pages/HistoryPage';
import { RulesPage } from './pages/RulesPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <RedactProvider>
        <div className="min-h-screen bg-[#F3F4F6] text-[#111827] font-sans antialiased flex flex-col">
          {/* Exact Top Navbar */}
          <Navbar />

          {/* Main Views for the 5 requested pages */}
          <main className="flex-1 pb-12">
            <Routes>
              {/* Step 1: New Redaction / Upload */}
              <Route path="/" element={<NewRedactionPage />} />
              <Route path="/new" element={<NewRedactionPage />} />

              {/* Step 2: Review Workspace */}
              <Route path="/review" element={<ReviewWorkspacePage />} />
              <Route path="/review/:id" element={<ReviewWorkspacePage />} />

              {/* Step 3: Verify & Export */}
              <Route path="/verify" element={<VerifyExportPage />} />
              <Route path="/verify/:id" element={<VerifyExportPage />} />

              {/* History */}
              <Route path="/history" element={<HistoryPage />} />

              {/* Rules */}
              <Route path="/rules" element={<RulesPage />} />

              {/* Catch-all to Home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </RedactProvider>
    </BrowserRouter>
  );
};

export default App;
