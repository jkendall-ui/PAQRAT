import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Shield,
  LogOut,
} from 'lucide-react';
import type { NavDestination } from './M3NavigationBar';

export interface M3NavigationRailProps {
  destinations: NavDestination[];
  fab?: ReactNode;
  className?: string;
}

const iconMap: Record<string, ReactNode> = {
  '/dashboard': <LayoutDashboard size={20} />,
  '/study': <GraduationCap size={20} />,
  '/library': <BookOpen size={20} />,
  '/progress': <TrendingUp size={20} />,
  '/admin': <Shield size={20} />,
};

export function M3NavigationRail({ destinations, fab, className = '' }: M3NavigationRailProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside
      className={`hidden md:flex fixed inset-y-0 left-0 z-50 w-60 flex-col border-r border-[color:var(--ds-border,#091e4224)] bg-[color:var(--ds-surface,#fff)] ${className}`}
    >
      {/* App title */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[color:var(--ds-border,#091e4224)]">
        <GraduationCap size={24} className="text-[color:var(--ds-text-brand,#0c66e4)]" />
        <span className="text-sm font-semibold text-[color:var(--ds-text,#172b4d)]">PA Exam Prep</span>
      </div>

      {fab && <div className="px-3 pt-3">{fab}</div>}

      {/* Nav links */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto py-2 px-2">
        <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
          {destinations.map((dest) => {
            const active = location.pathname === dest.path || location.pathname.startsWith(dest.path + '/');
            const icon = iconMap[dest.path] ?? dest.icon;
            return (
              <li key={dest.path}>
                <Link
                  to={dest.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm no-underline transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ds-border-focused,#388bff)]
                    ${active
                      ? 'bg-[color:var(--ds-background-selected,#e9f2ff)] text-[color:var(--ds-text-selected,#0c66e4)] font-medium'
                      : 'text-[color:var(--ds-text-subtle,#44546f)] hover:bg-[color:var(--ds-background-neutral-subtle-hovered,#091e420f)]'
                    }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="flex-shrink-0">{icon}</span>
                  <span>{dest.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section at bottom */}
      {user && (
        <div className="border-t border-[color:var(--ds-border,#091e4224)] px-3 py-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-[color:var(--ds-background-brand-bold,#0c66e4)] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
              {user.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[color:var(--ds-text,#172b4d)] truncate">{user.name}</div>
              <div className="text-xs text-[color:var(--ds-text-subtlest,#626f86)] truncate">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="flex-shrink-0 p-1.5 rounded hover:bg-[color:var(--ds-background-neutral-subtle-hovered,#091e420f)] text-[color:var(--ds-text-subtle,#44546f)]"
              aria-label="Sign out"
              type="button"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
