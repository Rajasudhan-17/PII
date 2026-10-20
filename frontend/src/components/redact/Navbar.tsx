import React from 'react';
import { NavLink } from 'react-router-dom';
import { Lock } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="h-16 bg-white border-b border-[#E5E7EB] px-6 lg:px-10 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Nav Items */}
      <div className="flex items-center gap-8">
        {/* Brand Logo */}
        <NavLink to="/" className="flex items-center gap-2 group">
          <div className="flex items-center gap-1">
            <span className="w-4 h-1.5 bg-[#FACC15] rounded-[1px] inline-block" />
            <span className="w-4 h-1.5 bg-[#111827] rounded-[1px] inline-block" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-[#111827]">
            Redact
          </span>
        </NavLink>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 text-xs">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive
                ? 'bg-[#111827] text-white font-semibold px-3.5 py-1.5 rounded-full shadow-sm'
                : 'text-[#4B5563] hover:text-[#111827] font-medium px-3.5 py-1.5 transition-colors'
            }
          >
            New redaction
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) =>
              isActive
                ? 'bg-[#111827] text-white font-semibold px-3.5 py-1.5 rounded-full shadow-sm'
                : 'text-[#4B5563] hover:text-[#111827] font-medium px-3.5 py-1.5 transition-colors'
            }
          >
            History
          </NavLink>

          <NavLink
            to="/rules"
            className={({ isActive }) =>
              isActive
                ? 'bg-[#111827] text-white font-semibold px-3.5 py-1.5 rounded-full shadow-sm'
                : 'text-[#4B5563] hover:text-[#111827] font-medium px-3.5 py-1.5 transition-colors'
            }
          >
            Rules
          </NavLink>
        </nav>
      </div>

      {/* Right Controls: Auto-delete Indicator + User Avatar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-[11px] text-[#4B5563] font-medium">
          <Lock className="w-3 h-3 text-[#6B7280]" />
          <span>Files auto-delete after 24 h</span>
        </div>

        {/* User Avatar RS */}
        <div
          title="Rajasudhan (Active User)"
          className="w-7 h-7 rounded-full bg-[#111827] text-white text-[11px] font-bold flex items-center justify-center tracking-tight cursor-default shadow-sm"
        >
          RS
        </div>
      </div>
    </header>
  );
};
