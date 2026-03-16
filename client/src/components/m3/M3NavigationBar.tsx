import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Shield,
} from 'lucide-react';

export interface NavDestination {
  icon: ReactNode;
  label: string;
  path: string;
}

export interface M3NavigationBarProps {
  destinations: NavDestination[];
  className?: string;
}

const iconMap: Record<string, ReactNode> = {
  '/dashboard': <LayoutDashboard size={20} />,
  '/study': <GraduationCap size={20} />,
  '/library': <BookOpen size={20} />,
  '/progress': <TrendingUp size={20} />,
  '/admin': <Shield size={20} />,
};

export function M3NavigationBar({ destinations, className = '' }: M3NavigationBarProps) {
  const location = useLocation();

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-[color:var(--ds-border,#091e4224)] bg-[color:var(--ds-surface,#fff)] ${className}`}
    >
      <nav role="navigation" aria-label="Main navigation">
        <ul className="list-none m-0 p-0 flex justify-around">
          {destinations.map((dest) => {
            const active = location.pathname === dest.path || location.pathname.startsWith(dest.path + '/');
            const icon = iconMap[dest.path] ?? dest.icon;
            return (
              <li key={dest.path}>
                <Link
                  to={dest.path}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[48px] min-h-[44px] no-underline transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ds-border-focused,#388bff)]
                    ${active
                      ? 'text-[color:var(--ds-text-selected,#0c66e4)]'
                      : 'text-[color:var(--ds-text-subtle,#44546f)]'
                    }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span>{icon}</span>
                  <span className={`text-[11px] ${active ? 'font-medium' : ''}`}>{dest.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
