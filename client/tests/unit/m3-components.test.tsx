import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import {
  M3Button,
  M3Card,
  M3TextField,
  M3Chip,
  M3NavigationBar,
  M3NavigationRail,
  M3SegmentedButton,
  M3FilterChip,
  M3FAB,
  M3Snackbar,
  M3BottomSheet,
  M3Dialog,
  M3LinearProgress,
  M3CircularProgress,
} from '../../src/components/m3';
import type { NavDestination } from '../../src/components/m3';

const destinations: NavDestination[] = [
  { icon: <span>D</span>, label: 'Dashboard', path: '/dashboard' },
  { icon: <span>S</span>, label: 'Study', path: '/study' },
  { icon: <span>L</span>, label: 'Library', path: '/library' },
  { icon: <span>P</span>, label: 'Progress', path: '/progress' },
];

// ── M3Button ──────────────────────────────────────────────────────────────────

describe('M3Button', () => {
  it('renders filled variant by default', () => {
    render(<M3Button>Click me</M3Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders outlined variant', () => {
    render(<M3Button variant="outlined">Outlined</M3Button>);
    expect(screen.getByRole('button', { name: 'Outlined' })).toBeInTheDocument();
  });

  it('renders text variant', () => {
    render(<M3Button variant="text">Text</M3Button>);
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
  });

  it('renders icon variant', () => {
    render(<M3Button variant="icon" aria-label="menu">☰</M3Button>);
    expect(screen.getByRole('button', { name: 'menu' })).toBeInTheDocument();
  });
});

// ── M3Card ────────────────────────────────────────────────────────────────────

describe('M3Card', () => {
  it('renders filled variant by default', () => {
    render(<M3Card>Content</M3Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders elevated variant', () => {
    render(<M3Card variant="elevated">Elevated</M3Card>);
    expect(screen.getByText('Elevated')).toBeInTheDocument();
  });

  it('renders outlined variant', () => {
    render(<M3Card variant="outlined">Outlined</M3Card>);
    expect(screen.getByText('Outlined')).toBeInTheDocument();
  });
});

// ── M3TextField ───────────────────────────────────────────────────────────────

describe('M3TextField', () => {
  it('renders with label', () => {
    render(<M3TextField label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows error text when error is true', () => {
    render(<M3TextField label="Field" error errorText="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});

// ── M3Chip ────────────────────────────────────────────────────────────────────

describe('M3Chip', () => {
  it('renders input chip', () => {
    render(<M3Chip variant="input">Tag</M3Chip>);
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
  });

  it('renders assist chip', () => {
    render(<M3Chip variant="assist">Help</M3Chip>);
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });
});

// ── M3NavigationBar ───────────────────────────────────────────────────────────

describe('M3NavigationBar', () => {
  it('renders all destinations', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <M3NavigationBar destinations={destinations} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Study')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });
});

// ── M3NavigationRail ──────────────────────────────────────────────────────────

describe('M3NavigationRail', () => {
  it('renders all destinations', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <M3NavigationRail destinations={destinations} />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });
});

// ── M3SegmentedButton ─────────────────────────────────────────────────────────

describe('M3SegmentedButton', () => {
  it('renders options and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <M3SegmentedButton
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

// ── M3FilterChip ──────────────────────────────────────────────────────────────

describe('M3FilterChip', () => {
  it('renders with selected state', () => {
    render(<M3FilterChip selected>Active</M3FilterChip>);
    expect(screen.getByRole('button', { name: /Active/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── M3FAB ─────────────────────────────────────────────────────────────────────

describe('M3FAB', () => {
  it('renders icon-only FAB', () => {
    render(<M3FAB icon={<span>+</span>} aria-label="Add" />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('renders extended FAB with label', () => {
    render(<M3FAB icon={<span>+</span>} label="New Session" />);
    expect(screen.getByText('New Session')).toBeInTheDocument();
  });
});

// ── M3Snackbar ────────────────────────────────────────────────────────────────

describe('M3Snackbar', () => {
  it('renders message when open', () => {
    render(<M3Snackbar open message="Saved!" onClose={() => {}} />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<M3Snackbar open={false} message="Hidden" onClose={() => {}} />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

// ── M3BottomSheet ─────────────────────────────────────────────────────────────

describe('M3BottomSheet', () => {
  it('renders children when open', () => {
    render(
      <M3BottomSheet open onClose={() => {}}>
        <p>Sheet content</p>
      </M3BottomSheet>,
    );
    expect(screen.getByText('Sheet content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <M3BottomSheet open={false} onClose={() => {}}>
        <p>Hidden</p>
      </M3BottomSheet>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

// ── M3Dialog ──────────────────────────────────────────────────────────────────

describe('M3Dialog', () => {
  it('renders title and content when open', () => {
    render(
      <M3Dialog open onClose={() => {}} title="Confirm">
        <p>Are you sure?</p>
      </M3Dialog>,
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <M3Dialog open={false} onClose={() => {}} title="Hidden">
        <p>Nope</p>
      </M3Dialog>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

// ── M3LinearProgress ──────────────────────────────────────────────────────────

describe('M3LinearProgress', () => {
  it('renders with determinate value', () => {
    render(<M3LinearProgress value={50} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });
});

// ── M3CircularProgress ────────────────────────────────────────────────────────

describe('M3CircularProgress', () => {
  it('renders with determinate value', () => {
    render(<M3CircularProgress value={75} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('renders indeterminate spinner', () => {
    render(<M3CircularProgress indeterminate />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
