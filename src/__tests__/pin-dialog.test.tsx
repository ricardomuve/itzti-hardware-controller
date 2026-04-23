/**
 * Tests for PinDialog component.
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PinDialog from '../components/PinDialog';
import { useAuthStore } from '../store/auth-store';

// Mock the Tauri fs API used by pin-hash
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn().mockResolvedValue(''),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}));

beforeEach(() => {
  useAuthStore.setState({ role: 'user', pinHashExists: false });
});

describe('PinDialog — rendering', () => {
  it('should not render when open is false', () => {
    render(<PinDialog mode="login" open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('pin-dialog-overlay')).not.toBeInTheDocument();
  });

  it('should render overlay and dialog when open is true', () => {
    render(<PinDialog mode="login" open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('pin-dialog-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('pin-dialog')).toBeInTheDocument();
  });
});

describe('PinDialog — login mode (Req 2.1, 2.2)', () => {
  it('should show PIN input and Verificar button', () => {
    render(<PinDialog mode="login" open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('pin-input-current')).toBeInTheDocument();
    expect(screen.getByTestId('pin-dialog-submit')).toHaveTextContent('Verificar');
    // Should NOT show new/confirm fields
    expect(screen.queryByTestId('pin-input-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pin-input-confirm')).not.toBeInTheDocument();
  });

  it('should show error when submitting empty PIN', async () => {
    render(<PinDialog mode="login" open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('Ingrese el PIN.');
    });
  });

  it('should show error when login fails (incorrect PIN)', async () => {
    // Mock login to return false
    const loginMock = vi.fn().mockResolvedValue(false);
    useAuthStore.setState({ login: loginMock } as any);

    render(<PinDialog mode="login" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '9999' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('PIN incorrecto.');
    });
  });

  it('should call onClose on successful login', async () => {
    const loginMock = vi.fn().mockResolvedValue({ success: true });
    useAuthStore.setState({ login: loginMock } as any);
    const onClose = vi.fn();

    render(<PinDialog mode="login" open={true} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('1234');
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

describe('PinDialog — setup mode (Req 2.4, 2.5)', () => {
  it('should show new PIN and confirm fields with Guardar button', () => {
    render(<PinDialog mode="setup" open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('pin-input-new')).toBeInTheDocument();
    expect(screen.getByTestId('pin-input-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('pin-dialog-submit')).toHaveTextContent('Guardar');
    // Should NOT show current PIN field
    expect(screen.queryByTestId('pin-input-current')).not.toBeInTheDocument();
  });

  it('should show error for invalid PIN format', async () => {
    render(<PinDialog mode="setup" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent(
        'El PIN debe tener entre 4 y 8 dígitos numéricos.'
      );
    });
  });

  it('should show error when PINs do not match', async () => {
    render(<PinDialog mode="setup" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '5678' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('Los PINs no coinciden.');
    });
  });

  it('should call setupPin and onClose on valid setup', async () => {
    const setupPinMock = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ setupPin: setupPinMock } as any);
    const onClose = vi.fn();

    render(<PinDialog mode="setup" open={true} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '4567' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '4567' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(setupPinMock).toHaveBeenCalledWith('4567');
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

describe('PinDialog — change mode (Req 2.6)', () => {
  it('should show current PIN, new PIN, confirm fields with Cambiar button', () => {
    render(<PinDialog mode="change" open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('pin-input-current')).toBeInTheDocument();
    expect(screen.getByTestId('pin-input-new')).toBeInTheDocument();
    expect(screen.getByTestId('pin-input-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('pin-dialog-submit')).toHaveTextContent('Cambiar');
  });

  it('should show error when current PIN is empty', async () => {
    render(<PinDialog mode="change" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('Ingrese el PIN actual.');
    });
  });

  it('should show error for invalid new PIN format in change mode', async () => {
    render(<PinDialog mode="change" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent(
        'El nuevo PIN debe tener entre 4 y 8 dígitos numéricos.'
      );
    });
  });

  it('should show error when new PINs do not match in change mode', async () => {
    render(<PinDialog mode="change" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '5678' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '9999' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('Los PINs no coinciden.');
    });
  });

  it('should show error when current PIN is incorrect', async () => {
    const changePinMock = vi.fn().mockResolvedValue(false);
    useAuthStore.setState({ changePin: changePinMock } as any);

    render(<PinDialog mode="change" open={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '0000' } });
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '5678' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '5678' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('pin-dialog-error')).toHaveTextContent('PIN actual incorrecto.');
    });
  });

  it('should call changePin and onClose on successful change', async () => {
    const changePinMock = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({ changePin: changePinMock } as any);
    const onClose = vi.fn();

    render(<PinDialog mode="change" open={true} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '1234' } });
    fireEvent.change(screen.getByTestId('pin-input-new'), { target: { value: '5678' } });
    fireEvent.change(screen.getByTestId('pin-input-confirm'), { target: { value: '5678' } });
    fireEvent.click(screen.getByTestId('pin-dialog-submit'));

    await waitFor(() => {
      expect(changePinMock).toHaveBeenCalledWith('1234', '5678');
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

describe('PinDialog — cancel button', () => {
  it('should call onClose and reset fields when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<PinDialog mode="login" open={true} onClose={onClose} />);

    fireEvent.change(screen.getByTestId('pin-input-current'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('pin-dialog-cancel'));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
