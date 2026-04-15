/**
 * BusPanel — I2C/SPI UI controls for the Dashboard.
 * Requisitos: 1.1, 1.2, 1.3, 2.2, 3.1, 3.2, 4.1, 4.2, 4.3,
 *             5.1, 5.2, 5.5, 5.6, 6.1, 6.5, 6.6,
 *             7.1, 7.2, 7.3, 8.4, 10.1, 10.2, 10.3, 10.4
 */

import { useState, useCallback } from 'react';
import {
  validateI2cClockSpeed, validateSpiClockSpeed, validateI2cAddress7Bit,
  validateSpiMode, validateI2cSampleRate, validateSpiSampleRate, formatI2cAddress,
} from '../utils/validation';
import type { I2cBusInfo, I2cAddressMode, SpiBusInfo, SpiBitOrder } from '../communication/types';
import type { LogEntry } from './LogPanel';
import type { Alert } from './AlertPanel';

export interface BusPanelProps {
  onLogEntry?: (entry: LogEntry) => void;
  onAlert?: (alert: Alert) => void;
}

function parseHexString(hex: string): number[] | null {
  const cleaned = hex.replace(/\s+/g, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  return bytes;
}

function formatHexBytes(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

const inputCls = 'bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30';
const selectCls = inputCls;
const btnCls = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors';
const btnPrimary = `${btnCls} bg-accent/15 text-accent hover:bg-accent/25`;
const btnDanger = `${btnCls} bg-danger/15 text-danger hover:bg-danger/25`;

let logIdCounter = 0;
let alertIdCounter = 0;

export default function BusPanel({ onLogEntry, onAlert }: BusPanelProps) {
  const [i2cBuses, setI2cBuses] = useState<I2cBusInfo[]>([]);
  const [spiBuses, setSpiBuses] = useState<SpiBusInfo[]>([]);
  const [selectedI2cBus, setSelectedI2cBus] = useState<number>(0);
  const [scanResults, setScanResults] = useState<number[]>([]);
  const [scanning, setScanning] = useState(false);
  const [i2cClockSpeed, setI2cClockSpeed] = useState<number>(100);
  const [i2cAddressMode, setI2cAddressMode] = useState<I2cAddressMode>('SevenBit');
  const [i2cConfigError, setI2cConfigError] = useState('');
  const [spiClockSpeedHz, setSpiClockSpeedHz] = useState<number>(1000000);
  const [spiMode, setSpiMode] = useState<number>(0);
  const [spiBitOrder, setSpiBitOrder] = useState<SpiBitOrder>('MsbFirst');
  const [spiConfigError, setSpiConfigError] = useState('');
  const [selectedSpiBus, setSelectedSpiBus] = useState<number>(0);
  const [selectedSpiCs, setSelectedSpiCs] = useState<number>(0);
  const [i2cReadBus, setI2cReadBus] = useState<number>(0);
  const [i2cReadAddr, setI2cReadAddr] = useState('0x48');
  const [i2cReadLen, setI2cReadLen] = useState<number>(2);
  const [i2cReadResult, setI2cReadResult] = useState('');
  const [i2cWriteBus, setI2cWriteBus] = useState<number>(0);
  const [i2cWriteAddr, setI2cWriteAddr] = useState('0x48');
  const [i2cWriteData, setI2cWriteData] = useState('');
  const [i2cWriteStatus, setI2cWriteStatus] = useState('');
  const [spiTransferBus, setSpiTransferBus] = useState<number>(0);
  const [spiTransferCs, setSpiTransferCs] = useState<number>(0);
  const [spiTransferTxData, setSpiTransferTxData] = useState('');
  const [spiTransferResult, setSpiTransferResult] = useState('');
  const [i2cContinuousActive, setI2cContinuousActive] = useState(false);
  const [i2cSampleRate, setI2cSampleRate] = useState<number>(10);
  const [spiContinuousActive, setSpiContinuousActive] = useState(false);
  const [spiSampleRate, setSpiSampleRate] = useState<number>(100);

  const emitBusError = useCallback((busType: 'I2C' | 'SPI', addressOrCs: string, description: string) => {
    onLogEntry?.({ id: `bus-err-${++logIdCounter}`, timestamp: Date.now(), hexBytes: '', description: `[${busType}] ${addressOrCs}: ${description}`, level: 'error' });
  }, [onLogEntry]);

  const emitAlert = useCallback((message: string, channelId?: string) => {
    onAlert?.({ id: `bus-alert-${++alertIdCounter}`, type: 'error', message, timestamp: Date.now(), channelId });
  }, [onAlert]);

  const handleRefreshBuses = useCallback(async () => {
    try {
      const { DesktopAdapter } = await import('../communication/desktop-adapter');
      const adapter = new DesktopAdapter();
      setI2cBuses(await adapter.listI2cBuses());
      setSpiBuses(await adapter.listSpiBuses());
    } catch { setI2cBuses([]); setSpiBuses([]); }
  }, []);

  const handleScanI2c = useCallback(async () => {
    setScanning(true); setScanResults([]);
    try {
      const { DesktopAdapter } = await import('../communication/desktop-adapter');
      setScanResults(await new DesktopAdapter().scanI2c(selectedI2cBus));
    } catch (err: unknown) { emitBusError('I2C', `bus ${selectedI2cBus}`, `Scan failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setScanning(false); }
  }, [selectedI2cBus, emitBusError]);

  const handleApplyI2cConfig = useCallback(() => {
    if (!validateI2cClockSpeed(i2cClockSpeed)) { setI2cConfigError('Velocidad inválida. Valores válidos: 100, 400, 1000 kHz'); return; }
    setI2cConfigError('');
  }, [i2cClockSpeed]);

  const handleApplySpiConfig = useCallback(() => {
    if (!validateSpiClockSpeed(spiClockSpeedHz)) { setSpiConfigError('Velocidad inválida. Rango: 100,000 – 50,000,000 Hz'); return; }
    if (!validateSpiMode(spiMode)) { setSpiConfigError('Modo SPI inválido. Valores válidos: 0, 1, 2, 3'); return; }
    setSpiConfigError('');
  }, [spiClockSpeedHz, spiMode]);

  const handleI2cRead = useCallback(async () => {
    const addr = parseInt(i2cReadAddr, 16);
    if (!validateI2cAddress7Bit(addr)) { setI2cReadResult('Dirección inválida (0x03–0x77)'); return; }
    try { const { DesktopAdapter } = await import('../communication/desktop-adapter'); setI2cReadResult(formatHexBytes(await new DesktopAdapter().i2cRead(i2cReadBus, addr, i2cReadLen))); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); setI2cReadResult(`Error: ${msg}`); emitBusError('I2C', formatI2cAddress(addr), msg); }
  }, [i2cReadBus, i2cReadAddr, i2cReadLen, emitBusError]);

  const handleI2cWrite = useCallback(async () => {
    const addr = parseInt(i2cWriteAddr, 16);
    if (!validateI2cAddress7Bit(addr)) { setI2cWriteStatus('Dirección inválida (0x03–0x77)'); return; }
    const bytes = parseHexString(i2cWriteData);
    if (!bytes) { setI2cWriteStatus('Datos hex inválidos'); return; }
    try { const { DesktopAdapter } = await import('../communication/desktop-adapter'); await new DesktopAdapter().i2cWrite(i2cWriteBus, addr, bytes); setI2cWriteStatus('Escritura exitosa'); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); setI2cWriteStatus(`Error: ${msg}`); emitBusError('I2C', formatI2cAddress(addr), msg); }
  }, [i2cWriteBus, i2cWriteAddr, i2cWriteData, emitBusError]);

  const handleSpiTransfer = useCallback(async () => {
    const bytes = parseHexString(spiTransferTxData);
    if (!bytes) { setSpiTransferResult('Datos TX hex inválidos'); return; }
    try { const { DesktopAdapter } = await import('../communication/desktop-adapter'); setSpiTransferResult(formatHexBytes(await new DesktopAdapter().spiTransfer(spiTransferBus, spiTransferCs, bytes))); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); setSpiTransferResult(`Error: ${msg}`); emitBusError('SPI', `bus ${spiTransferBus} cs ${spiTransferCs}`, msg); }
  }, [spiTransferBus, spiTransferCs, spiTransferTxData, emitBusError]);

  const handleToggleI2cContinuous = useCallback(async () => {
    if (!validateI2cSampleRate(i2cSampleRate)) return;
    const addr = parseInt(i2cReadAddr, 16);
    if (!validateI2cAddress7Bit(addr)) return;
    try {
      const { DesktopAdapter } = await import('../communication/desktop-adapter');
      const adapter = new DesktopAdapter();
      if (i2cContinuousActive) { await adapter.stopI2cContinuous(i2cReadBus, addr); setI2cContinuousActive(false); }
      else { await adapter.startI2cContinuous(i2cReadBus, addr, i2cReadLen, i2cSampleRate); setI2cContinuousActive(true); }
    } catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); emitBusError('I2C', formatI2cAddress(addr), msg); emitAlert(`Lectura continua I2C detenida: ${msg}`); setI2cContinuousActive(false); }
  }, [i2cContinuousActive, i2cSampleRate, i2cReadAddr, i2cReadBus, i2cReadLen, emitBusError, emitAlert]);

  const handleToggleSpiContinuous = useCallback(async () => {
    if (!validateSpiSampleRate(spiSampleRate)) return;
    try {
      const { DesktopAdapter } = await import('../communication/desktop-adapter');
      const adapter = new DesktopAdapter();
      if (spiContinuousActive) { await adapter.stopSpiContinuous(spiTransferBus, spiTransferCs); setSpiContinuousActive(false); }
      else { await adapter.startSpiContinuous(spiTransferBus, spiTransferCs, parseHexString(spiTransferTxData) || [0], spiSampleRate); setSpiContinuousActive(true); }
    } catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); emitBusError('SPI', `bus ${spiTransferBus} cs ${spiTransferCs}`, msg); emitAlert(`Lectura continua SPI detenida: ${msg}`); setSpiContinuousActive(false); }
  }, [spiContinuousActive, spiSampleRate, spiTransferBus, spiTransferCs, spiTransferTxData, emitBusError, emitAlert]);

  return (
    <div data-testid="bus-panel" className="space-y-6">
      <h2 className="text-base font-semibold text-text-primary">Buses I2C / SPI</h2>

      {/* Bus Discovery */}
      <section data-testid="bus-discovery-section" className="space-y-3">
        <button data-testid="refresh-buses-btn" onClick={handleRefreshBuses} className={btnPrimary}>Actualizar Buses</button>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div data-testid="i2c-bus-list">
            <h4 className="text-sm font-medium text-text-secondary mb-2">I2C ({i2cBuses.length})</h4>
            {i2cBuses.length === 0 && <p data-testid="no-i2c-buses" className="text-text-muted text-xs">No se encontraron buses I2C.</p>}
            <div className="space-y-1">
              {i2cBuses.map((bus) => (
                <div key={bus.busNumber} data-testid={`i2c-bus-${bus.busNumber}`} className="flex items-center gap-2 text-xs bg-surface rounded-md px-2 py-1.5 border border-border">
                  <span className="text-text-primary">Bus {bus.busNumber}</span>
                  <span className="text-text-muted truncate">{bus.path}</span>
                  {bus.accessible
                    ? <span data-testid={`i2c-bus-accessible-${bus.busNumber}`} className="text-success ml-auto">✓</span>
                    : <span data-testid={`i2c-bus-inaccessible-${bus.busNumber}`} className="text-danger ml-auto">✗ {bus.errorMessage || ''}</span>}
                </div>
              ))}
            </div>
          </div>
          <div data-testid="spi-bus-list">
            <h4 className="text-sm font-medium text-text-secondary mb-2">SPI ({spiBuses.length})</h4>
            {spiBuses.length === 0 && <p data-testid="no-spi-buses" className="text-text-muted text-xs">No se encontraron buses SPI.</p>}
            <div className="space-y-1">
              {spiBuses.map((bus) => (
                <div key={`${bus.busNumber}-${bus.chipSelect}`} data-testid={`spi-bus-${bus.busNumber}-${bus.chipSelect}`} className="flex items-center gap-2 text-xs bg-surface rounded-md px-2 py-1.5 border border-border">
                  <span className="text-text-primary">Bus {bus.busNumber} CS {bus.chipSelect}</span>
                  <span className="text-text-muted truncate">{bus.path}</span>
                  {bus.accessible
                    ? <span data-testid={`spi-bus-accessible-${bus.busNumber}-${bus.chipSelect}`} className="text-success ml-auto">✓</span>
                    : <span data-testid={`spi-bus-inaccessible-${bus.busNumber}-${bus.chipSelect}`} className="text-danger ml-auto">✗</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* I2C Scan */}
      <section data-testid="i2c-scan-section" className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">Escaneo I2C</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">Bus:</label>
          <input data-testid="i2c-scan-bus-input" type="number" min={0} value={selectedI2cBus} onChange={(e) => setSelectedI2cBus(Number(e.target.value))} className={`${inputCls} w-20`} />
          <button data-testid="i2c-scan-btn" onClick={handleScanI2c} disabled={scanning} className={`${btnPrimary} disabled:opacity-40`}>{scanning ? 'Escaneando...' : 'Escanear'}</button>
        </div>
        <div data-testid="i2c-scan-results" className="flex flex-wrap gap-1">
          {scanResults.length > 0
            ? scanResults.map((addr) => <span key={addr} data-testid={`i2c-scan-addr-${addr}`} className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md font-mono">{formatI2cAddress(addr)}</span>)
            : !scanning && <p data-testid="no-scan-results" className="text-text-muted text-xs">Sin resultados.</p>}
        </div>
      </section>

      {/* Config sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section data-testid="i2c-config-section" className="bg-surface rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-secondary">Config I2C</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div><label className="block text-xs text-text-muted mb-1">Velocidad</label><select data-testid="i2c-clock-speed-select" value={i2cClockSpeed} onChange={(e) => setI2cClockSpeed(Number(e.target.value))} className={selectCls}><option value={100}>100 kHz</option><option value={400}>400 kHz</option><option value={1000}>1000 kHz</option></select></div>
            <div><label className="block text-xs text-text-muted mb-1">Direccionamiento</label><select data-testid="i2c-address-mode-select" value={i2cAddressMode} onChange={(e) => setI2cAddressMode(e.target.value as I2cAddressMode)} className={selectCls}><option value="SevenBit">7 bits</option><option value="TenBit">10 bits</option></select></div>
            <button data-testid="i2c-config-apply-btn" onClick={handleApplyI2cConfig} className={btnPrimary}>Aplicar</button>
          </div>
          {i2cConfigError && <p data-testid="i2c-config-error" className="text-danger text-xs">{i2cConfigError}</p>}
        </section>

        <section data-testid="spi-config-section" className="bg-surface rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-secondary">Config SPI</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div><label className="block text-xs text-text-muted mb-1">Bus</label><input data-testid="spi-config-bus-input" type="number" min={0} value={selectedSpiBus} onChange={(e) => setSelectedSpiBus(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-1">CS</label><input data-testid="spi-config-cs-input" type="number" min={0} value={selectedSpiCs} onChange={(e) => setSelectedSpiCs(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-1">Velocidad (Hz)</label><input data-testid="spi-clock-speed-input" type="number" min={100000} max={50000000} value={spiClockSpeedHz} onChange={(e) => setSpiClockSpeedHz(Number(e.target.value))} className={`${inputCls} w-32`} /></div>
            <div><label className="block text-xs text-text-muted mb-1">Modo</label><select data-testid="spi-mode-select" value={spiMode} onChange={(e) => setSpiMode(Number(e.target.value))} className={selectCls}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></div>
            <div><label className="block text-xs text-text-muted mb-1">Bits</label><select data-testid="spi-bit-order-select" value={spiBitOrder} onChange={(e) => setSpiBitOrder(e.target.value as SpiBitOrder)} className={selectCls}><option value="MsbFirst">MSB</option><option value="LsbFirst">LSB</option></select></div>
            <button data-testid="spi-config-apply-btn" onClick={handleApplySpiConfig} className={btnPrimary}>Aplicar</button>
          </div>
          {spiConfigError && <p data-testid="spi-config-error" className="text-danger text-xs">{spiConfigError}</p>}
        </section>
      </div>

      {/* I2C Read/Write */}
      <section data-testid="i2c-rw-section" className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">I2C Lectura/Escritura</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <fieldset data-testid="i2c-read-form" className="bg-surface rounded-lg border border-border p-3 space-y-2">
            <legend className="text-xs font-medium text-text-muted px-1">Lectura I2C</legend>
            <div className="flex flex-wrap gap-2 items-end">
              <div><label className="block text-xs text-text-muted mb-1">Bus</label><input data-testid="i2c-read-bus" type="number" min={0} value={i2cReadBus} onChange={(e) => setI2cReadBus(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
              <div><label className="block text-xs text-text-muted mb-1">Dir</label><input data-testid="i2c-read-addr" type="text" value={i2cReadAddr} onChange={(e) => setI2cReadAddr(e.target.value)} className={`${inputCls} w-20 font-mono`} /></div>
              <div><label className="block text-xs text-text-muted mb-1">Len</label><input data-testid="i2c-read-len" type="number" min={1} value={i2cReadLen} onChange={(e) => setI2cReadLen(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
              <button data-testid="i2c-read-btn" onClick={handleI2cRead} className={btnPrimary}>Leer</button>
            </div>
            {i2cReadResult && <p data-testid="i2c-read-result" className="text-xs font-mono text-accent bg-surface-alt rounded px-2 py-1">{i2cReadResult}</p>}
          </fieldset>
          <fieldset data-testid="i2c-write-form" className="bg-surface rounded-lg border border-border p-3 space-y-2">
            <legend className="text-xs font-medium text-text-muted px-1">Escritura I2C</legend>
            <div className="flex flex-wrap gap-2 items-end">
              <div><label className="block text-xs text-text-muted mb-1">Bus</label><input data-testid="i2c-write-bus" type="number" min={0} value={i2cWriteBus} onChange={(e) => setI2cWriteBus(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
              <div><label className="block text-xs text-text-muted mb-1">Dir</label><input data-testid="i2c-write-addr" type="text" value={i2cWriteAddr} onChange={(e) => setI2cWriteAddr(e.target.value)} className={`${inputCls} w-20 font-mono`} /></div>
              <div><label className="block text-xs text-text-muted mb-1">Datos (hex)</label><input data-testid="i2c-write-data" type="text" placeholder="ff 01 a0" value={i2cWriteData} onChange={(e) => setI2cWriteData(e.target.value)} className={`${inputCls} w-32 font-mono`} /></div>
              <button data-testid="i2c-write-btn" onClick={handleI2cWrite} className={btnPrimary}>Escribir</button>
            </div>
            {i2cWriteStatus && <p data-testid="i2c-write-status" className="text-xs text-text-secondary">{i2cWriteStatus}</p>}
          </fieldset>
        </div>
      </section>

      {/* SPI Transfer */}
      <section data-testid="spi-transfer-section" className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">Transferencia SPI</h3>
        <fieldset data-testid="spi-transfer-form" className="bg-surface rounded-lg border border-border p-3 space-y-2">
          <legend className="text-xs font-medium text-text-muted px-1">SPI Full-Duplex</legend>
          <div className="flex flex-wrap gap-2 items-end">
            <div><label className="block text-xs text-text-muted mb-1">Bus</label><input data-testid="spi-transfer-bus" type="number" min={0} value={spiTransferBus} onChange={(e) => setSpiTransferBus(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-1">CS</label><input data-testid="spi-transfer-cs" type="number" min={0} value={spiTransferCs} onChange={(e) => setSpiTransferCs(Number(e.target.value))} className={`${inputCls} w-16`} /></div>
            <div><label className="block text-xs text-text-muted mb-1">TX (hex)</label><input data-testid="spi-transfer-tx" type="text" placeholder="ff 01 a0" value={spiTransferTxData} onChange={(e) => setSpiTransferTxData(e.target.value)} className={`${inputCls} w-40 font-mono`} /></div>
            <button data-testid="spi-transfer-btn" onClick={handleSpiTransfer} className={btnPrimary}>Transferir</button>
          </div>
          {spiTransferResult && <p data-testid="spi-transfer-result" className="text-xs font-mono text-accent bg-surface-alt rounded px-2 py-1">{spiTransferResult}</p>}
        </fieldset>
      </section>

      {/* Continuous Reading */}
      <section data-testid="continuous-reading-section" className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">Lectura Continua</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <fieldset data-testid="i2c-continuous-form" className="bg-surface rounded-lg border border-border p-3 space-y-2">
            <legend className="text-xs font-medium text-text-muted px-1">I2C Continua</legend>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Hz:</label>
              <input data-testid="i2c-sample-rate-input" type="number" min={1} max={1000} value={i2cSampleRate} onChange={(e) => setI2cSampleRate(Number(e.target.value))} className={`${inputCls} w-20`} />
              <button data-testid="i2c-continuous-btn" onClick={handleToggleI2cContinuous} className={i2cContinuousActive ? btnDanger : btnPrimary}>
                {i2cContinuousActive ? 'Detener' : 'Iniciar'}
              </button>
              {i2cContinuousActive && <span data-testid="i2c-continuous-status" className="text-success text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" /> Activa</span>}
            </div>
          </fieldset>
          <fieldset data-testid="spi-continuous-form" className="bg-surface rounded-lg border border-border p-3 space-y-2">
            <legend className="text-xs font-medium text-text-muted px-1">SPI Continua</legend>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Hz:</label>
              <input data-testid="spi-sample-rate-input" type="number" min={1} max={10000} value={spiSampleRate} onChange={(e) => setSpiSampleRate(Number(e.target.value))} className={`${inputCls} w-20`} />
              <button data-testid="spi-continuous-btn" onClick={handleToggleSpiContinuous} className={spiContinuousActive ? btnDanger : btnPrimary}>
                {spiContinuousActive ? 'Detener' : 'Iniciar'}
              </button>
              {spiContinuousActive && <span data-testid="spi-continuous-status" className="text-success text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" /> Activa</span>}
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
