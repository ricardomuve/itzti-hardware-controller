/**
 * Safe Mode parameter defaults for the sensory deprivation tank.
 *
 * When the MCU enters safe mode (watchdog timeout, hardware fault, etc.),
 * these are the values each actuator should be set to. The MCU firmware
 * should have these hardcoded as well — this file is the app-side mirror
 * for UI display and for sending explicit safe-mode-with-values commands.
 *
 * Design rationale per parameter:
 *
 * | Parameter       | Safe Value | Why                                                    |
 * |-----------------|------------|--------------------------------------------------------|
 * | brightness      | 30%        | Dim emergency lighting — not dark, not blinding        |
 * | actuatorPos     | 0          | Return to home/neutral position                        |
 * | actuatorSpeed   | 0          | Stop all motors immediately                            |
 * | volume          | 0          | Silence audio — avoid startling the user                |
 * | audioSource     | 0          | Default source (doesn't matter if volume is 0)         |
 * | lightOn         | 1 (on)     | Emergency light ON — user must be able to see           |
 * | waterTemp       | 34.5°C     | Maintain safe skin-contact temp (not heating, not cold) |
 * | waterPump       | 1 (on)     | Keep filtration running for hygiene                     |
 * | airPump         | 1 (on)     | Ensure ventilation in enclosed tank                     |
 * | heater          | 0 (off)    | Stop heating — prevent overtemp without monitoring      |
 * | uvSterilizer    | 0 (off)    | Stop UV — no one should be exposed without session      |
 * | lidLock         | 0 (unlock) | NEVER lock the user in during a fault                   |
 * | binauralAudio   | 0 (off)    | Stop binaural generation                                |
 * | saltPump        | 0 (off)    | Stop salt dosing                                        |
 */

export interface SafeModeParam {
  /** Parameter name matching device-store param keys */
  paramName: string;
  /** Value to set when entering safe mode */
  safeValue: number;
  /** Human-readable description */
  label: string;
  /** Unit for display */
  unit: string;
  /** Priority: 'critical' params are set first (e.g. lid unlock) */
  priority: 'critical' | 'high' | 'normal';
  /** Rationale for this safe value */
  rationale: string;
}

/**
 * Ordered list of safe mode parameters. Critical items first.
 */
export const SAFE_MODE_PARAMS: SafeModeParam[] = [
  // --- CRITICAL: user safety ---
  {
    paramName: 'lidLock',
    safeValue: 0,
    label: 'Cerradura Tapa',
    unit: '',
    priority: 'critical',
    rationale: 'NUNCA bloquear al usuario dentro del tanque durante una falla',
  },
  {
    paramName: 'airPump',
    safeValue: 1,
    label: 'Bomba de Aire',
    unit: '',
    priority: 'critical',
    rationale: 'Mantener ventilación en tanque cerrado',
  },
  {
    paramName: 'lightOn',
    safeValue: 1,
    label: 'Luz de Emergencia',
    unit: '',
    priority: 'critical',
    rationale: 'El usuario debe poder ver para salir',
  },

  // --- HIGH: prevent damage ---
  {
    paramName: 'heater',
    safeValue: 0,
    label: 'Calentador',
    unit: '',
    priority: 'high',
    rationale: 'Detener calentamiento sin monitoreo de temperatura',
  },
  {
    paramName: 'actuatorSpeed',
    safeValue: 0,
    label: 'Velocidad Actuador',
    unit: 'rpm',
    priority: 'high',
    rationale: 'Detener motores inmediatamente',
  },
  {
    paramName: 'actuatorPos',
    safeValue: 0,
    label: 'Posición Actuador',
    unit: 'steps',
    priority: 'high',
    rationale: 'Retornar a posición neutral/home',
  },
  {
    paramName: 'uvSterilizer',
    safeValue: 0,
    label: 'Esterilizador UV',
    unit: '',
    priority: 'high',
    rationale: 'Detener UV — riesgo de exposición sin sesión activa',
  },

  // --- NORMAL: comfort/operational ---
  {
    paramName: 'volume',
    safeValue: 0,
    label: 'Volumen',
    unit: '%',
    priority: 'normal',
    rationale: 'Silenciar audio para no asustar al usuario',
  },
  {
    paramName: 'binauralAudio',
    safeValue: 0,
    label: 'Audio Binaural',
    unit: '',
    priority: 'normal',
    rationale: 'Detener generación de tonos',
  },
  {
    paramName: 'brightness',
    safeValue: 30,
    label: 'Brillo',
    unit: '%',
    priority: 'normal',
    rationale: 'Iluminación tenue de emergencia — visible pero no agresiva',
  },
  {
    paramName: 'waterPump',
    safeValue: 1,
    label: 'Bomba de Agua',
    unit: '',
    priority: 'normal',
    rationale: 'Mantener filtración activa por higiene',
  },
  {
    paramName: 'saltPump',
    safeValue: 0,
    label: 'Bomba de Sal',
    unit: '',
    priority: 'normal',
    rationale: 'Detener dosificación sin monitoreo',
  },
  {
    paramName: 'audioSource',
    safeValue: 0,
    label: 'Fuente Audio',
    unit: '',
    priority: 'normal',
    rationale: 'Fuente por defecto (irrelevante con volumen en 0)',
  },
];

/**
 * Returns safe mode params grouped by priority, critical first.
 */
export function getSafeModeParamsByPriority(): {
  critical: SafeModeParam[];
  high: SafeModeParam[];
  normal: SafeModeParam[];
} {
  return {
    critical: SAFE_MODE_PARAMS.filter((p) => p.priority === 'critical'),
    high: SAFE_MODE_PARAMS.filter((p) => p.priority === 'high'),
    normal: SAFE_MODE_PARAMS.filter((p) => p.priority === 'normal'),
  };
}

/**
 * Builds a map of paramName → safeValue for quick lookup.
 */
export function getSafeValueMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of SAFE_MODE_PARAMS) {
    map[p.paramName] = p.safeValue;
  }
  return map;
}
