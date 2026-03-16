import { Outlet } from 'react-router-dom';
import { M3NavigationBar } from './m3/M3NavigationBar';
import { M3NavigationRail } from './m3/M3NavigationRail';
import { useAuth } from '../context/AuthContext';
import type { NavDestination } from './m3/M3NavigationBar';

const baseDestinations: NavDestination[] = [
  { icon: null, label: 'Dashboard', path: '/dashboard' },
  { icon: null, label: 'Study', path: '/study' },
  { icon: null, label: 'Library', path: '/library' },
  { icon: null, label: 'Progress', path: '/progress' },
];

const adminDestination: NavDestination = {
  icon: null,
  label: 'Admin',
  path: '/admin',
};

export function AppLayout() {
  const { user } = useAuth();
  const destinations = user?.role === 'admin'
    ? [...baseDestinations, adminDestination]
    : baseDestinations;

  return (
    <div className="min-h-screen bg-[color:var(--ds-surface,#fff)]">
      <M3NavigationRail destinations={destinations} />
      <main className="pb-20 md:pb-0 md:pl-60">
        <Outlet />
      </main>
      <M3NavigationBar destinations={destinations} />
    </div>
  );
}
