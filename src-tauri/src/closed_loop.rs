// src-tauri/src/closed_loop.rs
//
// Motor de lazo cerrado para tanque de privación sensorial.
// Hilo dedicado que:
// 1. Recibe datos biométricos (EEG, pulso, temperatura, GSR, SpO2)
// 2. Compara contra umbrales configurables
// 3. Dispara comandos I2C hacia actuadores
// 4. Emite sugerencias visuales al frontend vía eventos Tauri

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Biometric data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EegBands {
    pub delta: f64,
    pub theta: f64,
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BiometricSensorType {
    Eeg,
    Pulse,
    Temperature,
    Gsr,
    Spo2,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricSample {
    pub sensor_type: BiometricSensorType,
    pub channel_id: String,
    pub value: f64,
    pub timestamp: u64,
    pub eeg_bands: Option<EegBands>,
}

// ---------------------------------------------------------------------------
// Threshold configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub device_id: Option<String>,
    pub param_name: Option<String>,
    pub target_value: Option<f64>,
    pub volume_delta: Option<f64>,
    pub pitch_delta: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricThreshold {
    pub channel_id: String,
    pub sensor_type: BiometricSensorType,
    pub min: f64,
    pub max: f64,
    pub action: ThresholdAction,
}

// ---------------------------------------------------------------------------
// Closed-loop state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdViolation {
    pub channel_id: String,
    pub sensor_type: BiometricSensorType,
    pub current_value: f64,
    pub threshold_min: f64,
    pub threshold_max: f64,
    pub action: ThresholdAction,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClosedLoopState {
    pub active: bool,
    pub session_id: Option<String>,
    pub relaxation_score: f64,
    pub violations: Vec<ThresholdViolation>,
    pub last_cycle_timestamp: u64,
}

/// Audio adjustment suggestion emitted to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSuggestion {
    pub volume_delta: f64,
    pub pitch_delta: f64,
    pub reason: String,
    pub timestamp: u64,
}

/// Visual suggestion emitted to the expert frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpertSuggestion {
    pub severity: String, // "info", "warning", "critical"
    pub message: String,
    pub channel_id: String,
    pub suggested_action: String,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Messages for the control thread
// ---------------------------------------------------------------------------

pub enum ControlMessage {
    /// New biometric sample arrived
    Sample(BiometricSample),
    /// Update threshold configuration
    UpdateThresholds(Vec<BiometricThreshold>),
    /// Start a new session
    StartSession { session_id: String },
    /// Stop the current session
    StopSession,
    /// Request current state (response via Tauri event)
    RequestState,
    /// Shutdown the control thread
    Shutdown,
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

pub struct ClosedLoopEngine {
    sender: mpsc::Sender<ControlMessage>,
    state: Arc<Mutex<ClosedLoopState>>,
}

pub type SharedClosedLoop = Arc<Mutex<ClosedLoopEngine>>;

impl ClosedLoopEngine {
    pub fn send(&self, msg: ControlMessage) -> Result<(), String> {
        self.sender.send(msg).map_err(|e| format!("Control loop send error: {}", e))
    }

    pub fn get_state(&self) -> Result<ClosedLoopState, String> {
        self.state
            .lock()
            .map(|s| s.clone())
            .map_err(|e| format!("State lock error: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Relaxation score computation
// ---------------------------------------------------------------------------

/// Computes a relaxation score (0–100) from recent biometric data.
///
/// Heuristic:
/// - High alpha + theta EEG → higher score
/// - Low heart rate → higher score
/// - Stable temperature → higher score
/// - Low GSR (skin conductance) → higher score
fn compute_relaxation_score(recent_samples: &[BiometricSample]) -> f64 {
    if recent_samples.is_empty() {
        return 0.0;
    }

    let mut score = 50.0; // baseline

    // EEG contribution: alpha/theta ratio vs beta/gamma
    let eeg_samples: Vec<&BiometricSample> = recent_samples
        .iter()
        .filter(|s| matches!(s.sensor_type, BiometricSensorType::Eeg))
        .collect();

    if let Some(last_eeg) = eeg_samples.last() {
        if let Some(bands) = &last_eeg.eeg_bands {
            let calm = bands.alpha + bands.theta;
            let active = bands.beta + bands.gamma + 0.001; // avoid div by zero
            let ratio = calm / active;
            // ratio > 2 = very relaxed, ratio < 0.5 = very active
            score += (ratio - 1.0).clamp(-25.0, 25.0) * 10.0;
        }
    }

    // Pulse contribution: lower BPM = more relaxed
    let pulse_samples: Vec<&BiometricSample> = recent_samples
        .iter()
        .filter(|s| matches!(s.sensor_type, BiometricSensorType::Pulse))
        .collect();

    if let Some(last_pulse) = pulse_samples.last() {
        let bpm = last_pulse.value;
        // 60 bpm = +15, 80 bpm = 0, 100 bpm = -15
        score += (80.0 - bpm) * 0.75;
    }

    // GSR contribution: lower conductance = more relaxed
    let gsr_samples: Vec<&BiometricSample> = recent_samples
        .iter()
        .filter(|s| matches!(s.sensor_type, BiometricSensorType::Gsr))
        .collect();

    if let Some(last_gsr) = gsr_samples.last() {
        // Typical GSR: 1-20 µS. Lower = calmer.
        score += (5.0 - last_gsr.value).clamp(-10.0, 10.0);
    }

    score.clamp(0.0, 100.0)
}

// ---------------------------------------------------------------------------
// Control loop thread
// ---------------------------------------------------------------------------

/// Evaluation interval for the closed-loop control thread.
const LOOP_INTERVAL_MS: u64 = 100; // 10 Hz evaluation rate

/// Maximum number of recent samples to keep per channel for scoring.
const MAX_RECENT_SAMPLES: usize = 200;

/// Starts the closed-loop control engine on a dedicated thread.
///
/// Returns a `SharedClosedLoop` handle for sending messages from Tauri commands.
pub fn start_closed_loop(app_handle: tauri::AppHandle) -> SharedClosedLoop {
    let (tx, rx) = mpsc::channel::<ControlMessage>();

    let state = Arc::new(Mutex::new(ClosedLoopState {
        active: false,
        session_id: None,
        relaxation_score: 0.0,
        violations: vec![],
        last_cycle_timestamp: 0,
    }));

    let state_clone = Arc::clone(&state);

    thread::spawn(move || {
        let mut thresholds: Vec<BiometricThreshold> = Vec::new();
        let mut recent_samples: Vec<BiometricSample> = Vec::new();
        let mut session_active = false;
        let mut session_id: Option<String> = None;
        let mut last_eval = Instant::now();

        loop {
            // Drain all pending messages (non-blocking)
            loop {
                match rx.try_recv() {
                    Ok(ControlMessage::Sample(sample)) => {
                        recent_samples.push(sample);
                        // Trim to keep memory bounded
                        if recent_samples.len() > MAX_RECENT_SAMPLES * 5 {
                            let drain_count = recent_samples.len() - MAX_RECENT_SAMPLES;
                            recent_samples.drain(..drain_count);
                        }
                    }
                    Ok(ControlMessage::UpdateThresholds(new_thresholds)) => {
                        thresholds = new_thresholds;
                    }
                    Ok(ControlMessage::StartSession { session_id: sid }) => {
                        session_active = true;
                        session_id = Some(sid);
                        recent_samples.clear();
                        let _ = app_handle.emit("closed-loop-started", &session_id);
                    }
                    Ok(ControlMessage::StopSession) => {
                        session_active = false;
                        let stopped_id = session_id.take();
                        recent_samples.clear();
                        let _ = app_handle.emit("closed-loop-stopped", &stopped_id);
                    }
                    Ok(ControlMessage::RequestState) => {
                        if let Ok(s) = state_clone.lock() {
                            let _ = app_handle.emit("closed-loop-state", &*s);
                        }
                    }
                    Ok(ControlMessage::Shutdown) => return,
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => return,
                }
            }

            // Evaluate at fixed interval
            if last_eval.elapsed() < Duration::from_millis(LOOP_INTERVAL_MS) {
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            last_eval = Instant::now();

            if !session_active {
                continue;
            }

            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            // --- Evaluate thresholds ---
            let mut violations: Vec<ThresholdViolation> = Vec::new();

            for threshold in &thresholds {
                // Find the most recent sample for this channel
                let last_sample = recent_samples
                    .iter()
                    .rev()
                    .find(|s| s.channel_id == threshold.channel_id);

                if let Some(sample) = last_sample {
                    let violated = sample.value < threshold.min || sample.value > threshold.max;
                    if violated {
                        let violation = ThresholdViolation {
                            channel_id: threshold.channel_id.clone(),
                            sensor_type: threshold.sensor_type.clone(),
                            current_value: sample.value,
                            threshold_min: threshold.min,
                            threshold_max: threshold.max,
                            action: threshold.action.clone(),
                            timestamp: now_ms,
                        };

                        // Emit expert suggestion for each violation
                        let severity = if (sample.value - threshold.max).abs() > 20.0
                            || (threshold.min - sample.value).abs() > 20.0
                        {
                            "critical"
                        } else {
                            "warning"
                        };

                        let suggestion = ExpertSuggestion {
                            severity: severity.to_string(),
                            message: format!(
                                "{:?} en canal {} = {:.2} (umbral: {:.1}–{:.1})",
                                threshold.sensor_type,
                                threshold.channel_id,
                                sample.value,
                                threshold.min,
                                threshold.max
                            ),
                            channel_id: threshold.channel_id.clone(),
                            suggested_action: format!("{:?}", threshold.action.action_type),
                            timestamp: now_ms,
                        };
                        let _ = app_handle.emit("expert-suggestion", &suggestion);

                        // Emit audio suggestion if action is audio adjustment
                        if threshold.action.action_type == "adjust_audio" {
                            let audio_suggestion = AudioSuggestion {
                                volume_delta: threshold.action.volume_delta.unwrap_or(0.0),
                                pitch_delta: threshold.action.pitch_delta.unwrap_or(0.0),
                                reason: format!(
                                    "{:?} threshold crossed on {}",
                                    threshold.sensor_type, threshold.channel_id
                                ),
                                timestamp: now_ms,
                            };
                            let _ = app_handle.emit("audio-suggestion", &audio_suggestion);
                        }

                        violations.push(violation);
                    }
                }
            }

            // --- Compute relaxation score ---
            let relaxation = compute_relaxation_score(&recent_samples);

            // --- Update shared state ---
            if let Ok(mut state) = state_clone.lock() {
                state.active = session_active;
                state.session_id = session_id.clone();
                state.relaxation_score = relaxation;
                state.violations = violations;
                state.last_cycle_timestamp = now_ms;
            }

            // Emit periodic state update (every cycle)
            if let Ok(s) = state_clone.lock() {
                let _ = app_handle.emit("closed-loop-update", &*s);
            }
        }
    });

    Arc::new(Mutex::new(ClosedLoopEngine {
        sender: tx,
        state,
    }))
}
