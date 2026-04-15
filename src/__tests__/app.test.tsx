/**
 * Tests for App.tsx — verifies bridge initialization, incompatible browser
 * message, AuthGate integration, PinDialog wiring, and store initialization.
 * Requisitos: 1.1, 2.5, 3.2, 7.2, 9.5, 10.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

// Mock initBridge
vi.mock('../communication/hardware-bridge', () => ({
  initBridge: vi.fn(),
}));

// Mock auth-store
const mockLoadPinStatus = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();
let mockRole: 'user' | 'expert' = 'user';
let mockPinHashExists = true; // default to true so PinDialog doesn't auto-open

vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: any) => any) =>
      selector({ role: mockRole, pinHashExists: mockPinHashExists }),
    {
      getState: () => ({
        loadPinStatus: mockLoadPinStatus,
        role: mockRole,
        pinHashExists: mockPinHashExists,
        logout: mockLogout,
      }),
    },
  ),
}));

// Mock preset-store
const mockLoadPresets = vi.fn().mockResolvedValue(undefined);

vi.mock('../store/preset-store', () => ({
  usePresetStore: Object.assign(
    (selector: (s: any) => any) => selector({ presets: [], loading: false }),
    {
      getState: () => ({
        loadPresets: mockLoadPresets,
      }),
    },
  ),
}));

// Mock child components to keep tests focused on App wiring
vi.mock('../components/AuthGate', () => ({
  default: ({ onLoginLogout }: { onLoginLogout?: () => void }) => (
    <div data-testid="auth-gate">
      <button data-testid="mock-login-logout-btn" onClick={onLoginLogout}>
        Login/Logout
      </button>
    </div>
  ),
}));
vi.mock('../components/PinDialog', () => ({
  default: ({ mode, open, onClose }: { mode: string; open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="pin-dialog" data-mode={mode}>
        <button data-testid="pin-dialog-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));
vi.mock('../components/DeviceList', () => ({
  default: ({ hardwarePort }: { hardwarePort: unknown }) => (
    <div data-testid="device-list">{hardwarePort ? 'has-port' : 'no-port'}</div>
  ),
}));

import { initBridge } from '../communication/hardware-bridge';
const mockInitBridge = vi.mocked(initBridge);

beforeEach(() => {
  vi.clearAllMocks();
  mockRole = 'user';
  mockPinHashExists = true;
});

describe('App', () => {
  it('shows loading state initially', () => {
    mockInitBridge.mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    expect(screen.getByTestId('app-loading')).toBeInTheDocument();
  });

  it('renders all sections when bridge initializes successfully', async () => {
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeInTheDocument();
    });

    expect(screen.getByTestId('section-devices')).toBeInTheDocument();
    expect(screen.getByTestId('section-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
  });

  it('passes hardware port to DeviceList', async () => {
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('device-list')).toHaveTextContent('has-port');
    });
  });

  it('shows incompatible browser message when bridge fails (Req 9.5)', async () => {
    mockInitBridge.mockRejectedValue(
      new Error('El navegador no soporta Web Serial API ni WebUSB.')
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('app-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('incompatible-message')).toBeInTheDocument();
    expect(
      screen.getByText(/El navegador no soporta Web Serial API ni WebUSB/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Chrome 89\+, Edge 89\+/)
    ).toBeInTheDocument();
  });

  it('shows generic error message for unknown errors', async () => {
    mockInitBridge.mockRejectedValue('something weird');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('incompatible-message')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Error desconocido al inicializar/)
    ).toBeInTheDocument();
  });

  it('calls initBridge exactly once on mount', async () => {
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeInTheDocument();
    });

    expect(mockInitBridge).toHaveBeenCalledTimes(1);
  });

  it('calls loadPinStatus and loadPresets on mount (Req 2.5, 7.2)', async () => {
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(mockLoadPinStatus).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadPresets).toHaveBeenCalledTimes(1);
  });

  it('shows PinDialog in setup mode when no PIN exists (Req 2.5)', async () => {
    mockPinHashExists = false;
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pin-dialog')).toHaveAttribute('data-mode', 'setup');
  });

  it('opens PinDialog in login mode when login/logout button clicked as user', async () => {
    mockRole = 'user';
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('app')).toBeInTheDocument();
    });

    // PinDialog should not be open initially (pinHashExists = true)
    expect(screen.queryByTestId('pin-dialog')).not.toBeInTheDocument();

    // Click the login/logout button from AuthGate
    fireEvent.click(screen.getByTestId('mock-login-logout-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pin-dialog')).toHaveAttribute('data-mode', 'login');
  });

  it('closes PinDialog when onClose is called', async () => {
    mockPinHashExists = false;
    const fakePort = { listPorts: vi.fn() } as any;
    mockInitBridge.mockResolvedValue(fakePort);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('pin-dialog-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('pin-dialog')).not.toBeInTheDocument();
    });
  });
});
