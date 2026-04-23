/**
 * PinDialog — Modal dialog for PIN entry and management.
 * Supports three modes: login, setup (first time), and change PIN.
 *
 * Requisitos: 2.1, 2.2, 2.4, 2.5, 2.6
 */

import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth-store';
import { validatePinFormat } from '../utils/pin-hash';

export type PinDialogMode = 'login' | 'setup' | 'change';

export interface PinDialogProps {
  mode: PinDialogMode;
  open: boolean;
  onClose: () => void;
}

export default function PinDialog({ mode, open, onClose }: PinDialogProps) {
  const login = useAuthStore((s) => s.login);
  const setupPin = useAuthStore((s) => s.setupPin);
  const changePin = useAuthStore((s) => s.changePin);

  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetFields = useCallback(() => {
    setPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetFields();
    onClose();
  }, [resetFields, onClose]);

  const handleLogin = useCallback(async () => {
    setError('');
    if (!pin) {
      setError('Ingrese el PIN.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(pin);
      if (result.success) {
        resetFields();
        onClose();
      } else if (result.lockedMs && result.lockedMs > 0) {
        const secs = Math.ceil(result.lockedMs / 1000);
        setError(`Demasiados intentos. Espere ${secs} segundos.`);
      } else if (result.remainingAttempts !== undefined) {
        setError(`PIN incorrecto. ${result.remainingAttempts} intento${result.remainingAttempts !== 1 ? 's' : ''} restante${result.remainingAttempts !== 1 ? 's' : ''}.`);
      } else {
        setError('PIN incorrecto.');
      }
    } catch {
      setError('Error al verificar el PIN.');
    } finally {
      setLoading(false);
    }
  }, [pin, login, resetFields, onClose]);

  const handleSetup = useCallback(async () => {
    setError('');
    if (!validatePinFormat(newPin)) {
      setError('El PIN debe tener entre 4 y 8 dígitos numéricos.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Los PINs no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await setupPin(newPin);
      resetFields();
      onClose();
    } catch {
      setError('Error al configurar el PIN.');
    } finally {
      setLoading(false);
    }
  }, [newPin, confirmPin, setupPin, resetFields, onClose]);

  const handleChange = useCallback(async () => {
    setError('');
    if (!pin) {
      setError('Ingrese el PIN actual.');
      return;
    }
    if (!validatePinFormat(newPin)) {
      setError('El nuevo PIN debe tener entre 4 y 8 dígitos numéricos.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Los PINs no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const success = await changePin(pin, newPin);
      if (success) {
        resetFields();
        onClose();
      } else {
        setError('PIN actual incorrecto.');
      }
    } catch {
      setError('Error al cambiar el PIN.');
    } finally {
      setLoading(false);
    }
  }, [pin, newPin, confirmPin, changePin, resetFields, onClose]);

  const handleSubmit = useCallback(() => {
    if (mode === 'login') return handleLogin();
    if (mode === 'setup') return handleSetup();
    return handleChange();
  }, [mode, handleLogin, handleSetup, handleChange]);

  if (!open) return null;

  const title =
    mode === 'login'
      ? 'Iniciar Sesión Experto'
      : mode === 'setup'
        ? 'Configurar PIN Inicial'
        : 'Cambiar PIN';

  return (
    <div
      data-testid="pin-dialog-overlay"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
    >
      <div
        data-testid="pin-dialog"
        role="dialog"
        aria-label={title}
        className="bg-surface-alt border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-text-primary mb-5">{title}</h2>

        {/* Current PIN field — login and change modes */}
        {(mode === 'login' || mode === 'change') && (
          <div className="mb-4">
            <label htmlFor="pin-current" className="block text-sm text-text-secondary mb-1.5">
              {mode === 'login' ? 'PIN' : 'PIN Actual'}
            </label>
            <input
              id="pin-current"
              data-testid="pin-input-current"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={loading}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-text-primary text-center text-xl tracking-[0.3em] placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              placeholder="••••"
            />
          </div>
        )}

        {/* New PIN field — setup and change modes */}
        {(mode === 'setup' || mode === 'change') && (
          <>
            <div className="mb-4">
              <label htmlFor="pin-new" className="block text-sm text-text-secondary mb-1.5">Nuevo PIN</label>
              <input
                id="pin-new"
                data-testid="pin-input-new"
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                disabled={loading}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-text-primary text-center text-xl tracking-[0.3em] placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
                placeholder="••••"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="pin-confirm" className="block text-sm text-text-secondary mb-1.5">Confirmar PIN</label>
              <input
                id="pin-confirm"
                data-testid="pin-input-confirm"
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                disabled={loading}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-text-primary text-center text-xl tracking-[0.3em] placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
                placeholder="••••"
              />
            </div>
          </>
        )}

        {/* Error message */}
        {error && (
          <div
            data-testid="pin-dialog-error"
            role="alert"
            className="text-danger text-sm mb-4 bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
          >
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            data-testid="pin-dialog-cancel"
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            data-testid="pin-dialog-submit"
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-surface hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
                ? 'Verificar'
                : mode === 'setup'
                  ? 'Guardar'
                  : 'Cambiar'}
          </button>
        </div>
      </div>
    </div>
  );
}
