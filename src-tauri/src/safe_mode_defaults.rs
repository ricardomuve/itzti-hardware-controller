// src-tauri/src/safe_mode_defaults.rs
//
// Safe mode parameter defaults for the sensory deprivation tank.
// Mirror of the frontend safe-mode-defaults.ts — both sides must agree.
//
// When safe mode is triggered, these values are applied in priority order:
// 1. CRITICAL: lid unlock, air pump, emergency light
// 2. HIGH: heater off, motors stop, UV off
// 3. NORMAL: audio off, brightness dim, pumps

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SafeParamPriority {
    Critical,
    High,
    Normal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafeModeParam {
    pub param_name: &'static str,
    pub safe_value: u16,
    pub priority: SafeParamPriority,
    pub label: &'static str,
}

/// Complete table of safe mode defaults, ordered by priority.
pub static SAFE_MODE_PARAMS: &[SafeModeParam] = &[
    // --- CRITICAL: user safety ---
    SafeModeParam { param_name: "lidLock",       safe_value: 0,  priority: SafeParamPriority::Critical, label: "Cerradura Tapa" },
    SafeModeParam { param_name: "airPump",       safe_value: 1,  priority: SafeParamPriority::Critical, label: "Bomba de Aire" },
    SafeModeParam { param_name: "lightOn",       safe_value: 1,  priority: SafeParamPriority::Critical, label: "Luz Emergencia" },
    // --- HIGH: prevent damage ---
    SafeModeParam { param_name: "heater",        safe_value: 0,  priority: SafeParamPriority::High, label: "Calentador" },
    SafeModeParam { param_name: "actuatorSpeed", safe_value: 0,  priority: SafeParamPriority::High, label: "Vel. Actuador" },
    SafeModeParam { param_name: "actuatorPos",   safe_value: 0,  priority: SafeParamPriority::High, label: "Pos. Actuador" },
    SafeModeParam { param_name: "uvSterilizer",  safe_value: 0,  priority: SafeParamPriority::High, label: "UV Esterilizador" },
    // --- NORMAL: comfort/operational ---
    SafeModeParam { param_name: "volume",        safe_value: 0,  priority: SafeParamPriority::Normal, label: "Volumen" },
    SafeModeParam { param_name: "binauralAudio", safe_value: 0,  priority: SafeParamPriority::Normal, label: "Audio Binaural" },
    SafeModeParam { param_name: "brightness",    safe_value: 30, priority: SafeParamPriority::Normal, label: "Brillo" },
    SafeModeParam { param_name: "waterPump",     safe_value: 1,  priority: SafeParamPriority::Normal, label: "Bomba Agua" },
    SafeModeParam { param_name: "saltPump",      safe_value: 0,  priority: SafeParamPriority::Normal, label: "Bomba Sal" },
    SafeModeParam { param_name: "audioSource",   safe_value: 0,  priority: SafeParamPriority::Normal, label: "Fuente Audio" },
];

/// Returns only the critical-priority params (for fastest application).
pub fn critical_params() -> Vec<&'static SafeModeParam> {
    SAFE_MODE_PARAMS.iter()
        .filter(|p| p.priority == SafeParamPriority::Critical)
        .collect()
}

/// Builds a flat list of (param_name, safe_value) tuples for I2C/serial dispatch.
pub fn all_safe_values() -> Vec<(&'static str, u16)> {
    SAFE_MODE_PARAMS.iter()
        .map(|p| (p.param_name, p.safe_value))
        .collect()
}
