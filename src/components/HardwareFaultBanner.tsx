/**
 * HardwareFaultBanner — Red blinking alert for parameters where the MCU
 * confirmed value doesn't match the desired value after 3 retries.
 *
 * Shown at the top of the expert dashboard when any fault is active.
 */

import { useCheckbackStore, type ParamFault } from '../store/checkback-store';

function FaultRow({ fault }: { fault: ParamFault }) {
  const clearFault = useCheckbackStore((s) => s.clearFault);

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-danger/10 rounded-lg border border-danger/30 animate-pulse">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-danger text-lg shrink-0">⚠</span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-danger truncate">
            {fault.paramName}
          </div>
          <div className="text-[10px] text-danger/70">
            Deseado: <span className="font-mono">{fault.desiredValue}</span>
            {fault.lastConfirmedValue !== null && (
              <> · MCU reportó: <span className="font-mono">{fault.lastConfirmedValue}</span></>
            )}
            {fault.lastConfirmedValue === null && (
              <> · Sin respuesta del MCU</>
            )}
            <> · {fault.attempts} intentos fallidos</>
          </div>
        </div>
      </div>
      <button
        onClick={() => clearFault(fault.deviceId, fault.paramName)}
        className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
        title="Descartar alerta (no corrige la falla)"
      >
        Descartar
      </button>
    </div>
  );
}

export default function HardwareFaultBanner() {
  const faults = useCheckbackStore((s) => s.faults);
  const clearAllFaults = useCheckbackStore((s) => s.clearAllFaults);

  if (faults.length === 0) return null;

  return (
    <div data-testid="hardware-fault-banner" className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-danger animate-ping" />
          <h2 className="text-sm font-bold text-danger uppercase tracking-wide">
            Falla de Hardware — Verificación Fallida
          </h2>
        </div>
        {faults.length > 1 && (
          <button
            onClick={clearAllFaults}
            className="px-2 py-1 rounded text-[10px] font-medium text-danger/70 hover:text-danger transition-colors"
          >
            Descartar todas
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {faults.map((f) => (
          <FaultRow key={`${f.deviceId}:${f.paramName}`} fault={f} />
        ))}
      </div>
    </div>
  );
}
