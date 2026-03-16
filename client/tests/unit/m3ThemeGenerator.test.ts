import { describe, it, expect } from 'vitest';
import { THEME } from '../../src/theme/atlassianTheme';

describe('Atlassian Theme', () => {
  it('exports a light theme constant', () => {
    expect(THEME).toBe('light');
  });

  it('does not set M3 CSS custom properties on :root', () => {
    const value = document.documentElement.style.getPropertyValue('--md-sys-color-primary');
    expect(value).toBe('');
  });
});
