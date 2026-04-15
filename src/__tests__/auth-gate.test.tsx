/**
 * Tests for AuthGate component.
 * Validates: Requirements 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthGate, { getVisibleComponents } from '../components/AuthGate';
import { useAuthStore } from '../store/auth-store';

// Mock uPlot to avoid canvas/matchMedia issues in jsdom
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    setData: vi.fn(),
  }));
  return { default: MockUPlot };
});
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

// Reset auth store before each test
beforeEach(() => {
  useAuthStore.setState({ role: 'user', pinHashExists: false });
});

describe('getVisibleComponents', () => {
  it('should include expert-only components for expert role', () => {
    const visible = getVisibleComponents('expert');
    expect(visible.has('Dashboard')).toBe(true);
    expect(visible.has('BusPanel')).toBe(true);
    expect(visible.has('LogPanel')).toBe(true);
    expect(visible.has('KnobControl')).toBe(true);
    expect(visible.has('SliderControl')).toBe(true);
    expect(visible.has('PresetEditor')).toBe(true);
    expect(visible.has('ThresholdControls')).toBe(true);
  });

  it('should include user-only components for user role', () => {
    const visible = getVisibleComponents('user');
    expect(visible.has('PresetSelector')).toBe(true);
    expect(visible.has('ReadOnlyCharts')).toBe(true);
    expect(visible.has('SessionControls')).toBe(true);
  });

  it('should include common components for both roles', () => {
    for (const role of ['expert', 'user'] as const) {
      const visible = getVisibleComponents(role);
      expect(visible.has('AlertPanel')).toBe(true);
      expect(visible.has('LoginLogoutButton')).toBe(true);
    }
  });

  it('should NOT include expert components for user role (Req 5.1, 5.2, 5.3, 5.4)', () => {
    const visible = getVisibleComponents('user');
    expect(visible.has('BusPanel')).toBe(false);
    expect(visible.has('LogPanel')).toBe(false);
    expect(visible.has('KnobControl')).toBe(false);
    expect(visible.has('SliderControl')).toBe(false);
    expect(visible.has('PresetEditor')).toBe(false);
    expect(visible.has('ThresholdControls')).toBe(false);
    expect(visible.has('Dashboard')).toBe(false);
  });

  it('should NOT include user-only components for expert role', () => {
    const visible = getVisibleComponents('expert');
    expect(visible.has('PresetSelector')).toBe(false);
    expect(visible.has('SessionControls')).toBe(false);
  });
});

describe('AuthGate component', () => {
  it('should render with data-role attribute matching current role', () => {
    render(<AuthGate />);
    expect(screen.getByTestId('auth-gate')).toHaveAttribute('data-role', 'user');
  });

  it('should show login button when role is user', () => {
    render(<AuthGate />);
    expect(screen.getByTestId('login-logout-btn')).toHaveTextContent('Iniciar Sesión Experto');
  });

  it('should show logout button when role is expert', () => {
    useAuthStore.setState({ role: 'expert' });
    render(<AuthGate />);
    expect(screen.getByTestId('login-logout-btn')).toHaveTextContent('Cerrar Sesión');
  });

  it('should show user-only sections when role is user (Req 5.5, 5.6, 5.7)', () => {
    render(<AuthGate />);
    expect(screen.getByTestId('user-preset-selector')).toBeInTheDocument();
    expect(screen.getByTestId('preset-selector')).toBeInTheDocument();
    expect(screen.getByTestId('shared-alert-panel')).toBeInTheDocument();
    expect(screen.getByTestId('signal-section')).toBeInTheDocument();
  });

  it('should hide expert-only sections when role is user (Req 5.1, 5.2, 5.3, 5.4)', () => {
    render(<AuthGate />);
    expect(screen.queryByTestId('expert-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expert-bus-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expert-log-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expert-preset-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expert-threshold-controls')).not.toBeInTheDocument();
  });

  it('should show expert-only sections when role is expert (Req 4.1, 4.2, 4.3, 4.4, 4.5)', () => {
    useAuthStore.setState({ role: 'expert' });
    render(<AuthGate />);
    expect(screen.getByTestId('expert-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('expert-bus-panel')).toBeInTheDocument();
    expect(screen.getByTestId('expert-log-panel')).toBeInTheDocument();
    expect(screen.getByTestId('expert-preset-editor')).toBeInTheDocument();
    expect(screen.getByTestId('expert-threshold-controls')).toBeInTheDocument();
  });

  it('should hide user-only sections when role is expert', () => {
    useAuthStore.setState({ role: 'expert' });
    render(<AuthGate />);
    expect(screen.queryByTestId('user-preset-selector')).not.toBeInTheDocument();
  });

  it('should always show AlertPanel and signal dashboard for both roles', () => {
    // User role
    const { unmount } = render(<AuthGate />);
    expect(screen.getByTestId('shared-alert-panel')).toBeInTheDocument();
    expect(screen.getByTestId('signal-dashboard')).toBeInTheDocument();
    unmount();

    // Expert role
    useAuthStore.setState({ role: 'expert' });
    render(<AuthGate />);
    expect(screen.getByTestId('shared-alert-panel')).toBeInTheDocument();
    expect(screen.getByTestId('signal-dashboard')).toBeInTheDocument();
  });

  it('should call logout and onLoginLogout when expert clicks logout', () => {
    useAuthStore.setState({ role: 'expert' });
    const onLoginLogout = vi.fn();
    render(<AuthGate onLoginLogout={onLoginLogout} />);

    fireEvent.click(screen.getByTestId('login-logout-btn'));

    // Should have called logout (role resets to user)
    expect(useAuthStore.getState().role).toBe('user');
    expect(onLoginLogout).toHaveBeenCalledOnce();
  });

  it('should call onLoginLogout when user clicks login button', () => {
    const onLoginLogout = vi.fn();
    render(<AuthGate onLoginLogout={onLoginLogout} />);

    fireEvent.click(screen.getByTestId('login-logout-btn'));

    // Role stays user (login dialog would be shown by parent)
    expect(useAuthStore.getState().role).toBe('user');
    expect(onLoginLogout).toHaveBeenCalledOnce();
  });
});
