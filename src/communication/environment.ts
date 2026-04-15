import type { IHardwarePort } from './hardware-port';

/**
 * Entorno de ejecución detectado.
 * - 'desktop': Tauri app nativa (window.__TAURI__ presente)
 * - 'web': Navegador web (Web Serial API o WebUSB)
 */
export type RuntimeEnvironment = 'desktop' | 'web';

/**
 * Detecta el entorno de ejecución actual.
 * Retorna 'desktop' si window.__TAURI__ está presente, 'web' en caso contrario.
 */
export function detectEnvironment(): RuntimeEnvironment {
  return typeof window !== 'undefined' && '__TAURI__' in window
    ? 'desktop'
    : 'web';
}

/**
 * Returns true when mock mode is requested via:
 * - ?mock query param in the URL
 * - VITE_MOCK_HARDWARE=true env variable
 * - Dev mode (import.meta.env.DEV) as automatic fallback
 */
export function isMockMode(): boolean {
  if (typeof window !== 'undefined' && window.location?.search?.includes('mock')) {
    return true;
  }
  try {
    if (import.meta.env?.VITE_MOCK_HARDWARE === 'true') return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Returns true if we're in Vite dev mode.
 */
function isDevMode(): boolean {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
}

/**
 * Factory que crea el adaptador de hardware apropiado según el entorno.
 *
 * Prioridad:
 * 0. Si mock mode activo → MockAdapter (para desarrollo sin hardware)
 * 1. Si __TAURI__ existe → DesktopAdapter
 * 2. Si navigator.serial existe → WebSerialAdapter
 * 3. Si navigator.usb existe → WebUSBAdapter
 * 4. Si dev mode → MockAdapter (fallback automático en desarrollo)
 * 5. Si ninguno → lanza Error descriptivo
 */
export async function createHardwarePort(): Promise<IHardwarePort> {
  // Explicit mock mode
  if (isMockMode()) {
    const { MockAdapter } = await import('./mock-adapter');
    console.log('[Environment] Using MockAdapter (mock mode)');
    return new MockAdapter();
  }

  const env = detectEnvironment();

  if (env === 'desktop') {
    const { DesktopAdapter } = await import('./desktop-adapter');
    return new DesktopAdapter();
  }

  if (typeof navigator !== 'undefined' && 'serial' in navigator) {
    const { WebSerialAdapter } = await import('./web-serial-adapter');
    return new WebSerialAdapter();
  }

  if (typeof navigator !== 'undefined' && 'usb' in navigator) {
    const { WebUSBAdapter } = await import('./web-usb-adapter');
    return new WebUSBAdapter();
  }

  // In dev mode, fall back to mock adapter automatically
  if (isDevMode()) {
    const { MockAdapter } = await import('./mock-adapter');
    console.log('[Environment] No hardware APIs available — using MockAdapter (dev fallback)');
    return new MockAdapter();
  }

  throw new Error('El navegador no soporta Web Serial API ni WebUSB.');
}
