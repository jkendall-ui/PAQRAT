import { describe, it, expect } from 'vitest';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config';

const fullConfig = resolveConfig(tailwindConfig);

describe('Tailwind Theme Configuration (Atlassian)', () => {
  it('should have a valid content array', () => {
    expect(fullConfig.content).toBeDefined();
  });

  it('should not contain M3 color custom properties', () => {
    const colors = fullConfig.theme.colors as Record<string, unknown>;
    // M3 colors should no longer be present
    expect(colors['primary']).not.toBe('var(--md-sys-color-primary)');
    expect(colors['surface']).toBeUndefined();
    expect(colors['on-surface']).toBeUndefined();
  });

  it('should not contain M3 typography scale', () => {
    const fontSize = fullConfig.theme.fontSize as Record<string, unknown>;
    expect(fontSize['display-lg']).toBeUndefined();
    expect(fontSize['headline-md']).toBeUndefined();
    expect(fontSize['body-lg']).toBeUndefined();
    expect(fontSize['label-sm']).toBeUndefined();
  });

  it('should not contain M3 motion tokens', () => {
    const durations = fullConfig.theme.transitionDuration as Record<string, unknown>;
    expect(durations['short1']).toBeUndefined();
    expect(durations['medium2']).toBeUndefined();
  });

  it('should have default Tailwind border radius values', () => {
    const borderRadius = fullConfig.theme.borderRadius as Record<string, string>;
    // Default Tailwind values should still exist
    expect(borderRadius['lg']).toBeDefined();
    expect(borderRadius['full']).toBeDefined();
  });
});
