import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import {
  M3Button,
  M3Dialog,
  M3Snackbar,
  M3LinearProgress,
  M3CircularProgress,
  M3TextField,
  M3FAB,
  M3SegmentedButton,
  M3FilterChip,
  M3NavigationBar,
  M3NavigationRail,
} from '../../src/components/m3';
import type { NavDestination } from '../../src/components/m3';

const destinations: NavDestination[] = [
  { icon: <span>D</span>, label: 'Dashboard', path: '/dashboard' },
  { icon: <span>S</span>, label: 'Study', path: '/study' },
  { icon: <span>L</span>, label: 'Library', path: '/library' },
  { icon: <span>P</span>, label: 'Progress', path: '/progress' },
];

describe('Accessibility: Component rendering', () => {
  it('M3Button filled renders as a button', () => {
    render(<M3Button>Submit</M3Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('M3Button outlined renders as a button', () => {
    render(<M3Button variant="outlined">Cancel</M3Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('M3Button icon variant renders as a button with label', () => {
    render(<M3Button variant="icon" aria-label="menu">☰</M3Button>);
    expect(screen.getByRole('button', { name: 'menu' })).toBeInTheDocument();
  });

  it('M3FilterChip renders as a button', () => {
    render(<M3FilterChip>Filter</M3FilterChip>);
    expect(screen.getByRole('button', { name: /Filter/ })).toBeInTheDocument();
  });

  it('M3FAB renders as a button with aria-label', () => {
    render(<M3FAB icon={<span>+</span>} aria-label="Add" />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('Accessibility: ARIA attributes', () => {
  it('M3Dialog renders when open', () => {
    render(
      <M3Dialog open onClose={() => {}} title="Confirm">
        <p>Content</p>
      </M3Dialog>,
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('M3Snackbar has aria-live="polite"', () => {
    render(<M3Snackbar open message="Saved!" onClose={() => {}} />);
    const snackbar = screen.getByRole('status');
    expect(snackbar).toHaveAttribute('aria-live', 'polite');
  });

  it('M3LinearProgress has role="progressbar"', () => {
    render(<M3LinearProgress value={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('M3CircularProgress has role="progressbar"', () => {
    render(<M3CircularProgress value={75} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('M3SegmentedButton uses role="radiogroup"', () => {
    render(
      <M3SegmentedButton
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('M3FAB icon-only has aria-label', () => {
    render(<M3FAB icon={<span>+</span>} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label');
  });
});

describe('Accessibility: Form inputs have associated labels', () => {
  it('M3TextField associates label with input via htmlFor', () => {
    render(<M3TextField label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
  });

  it('M3TextField error text has aria-live for screen readers', () => {
    render(<M3TextField label="Name" error errorText="Required field" />);
    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveAttribute('aria-live', 'assertive');
    expect(errorEl).toHaveTextContent('Required field');
  });
});

describe('Accessibility: Navigation', () => {
  it('M3NavigationBar renders navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <M3NavigationBar destinations={destinations} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(4);
  });

  it('M3NavigationRail renders navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <M3NavigationRail destinations={destinations} />
        </AuthProvider>
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(4);
  });
});
