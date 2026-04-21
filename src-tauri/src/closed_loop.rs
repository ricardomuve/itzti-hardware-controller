// src-tauri/src/closed_loop.rs
//
// Motor de lazo cerrado para tanque de privación sensorial.
// Hilo dedicado que:
// 1. Recibe datos biométricos (EEG, pulso, temperatura, GSR, SpO2)
// 2. Compara contra umbrales configurables
// 3. Dispara comandos I2C hacia actuadores
// 4. Emite sugerencias visuales al frontend vía eventos Tauri
//
// Optimizaciones de eficiencia:
// - Batch ingestion: samples llegan en lotes vía push_biometric_batch
// - Lock-free ingestion: usa mpsc sin mutex en el hot path
// - Per-channel latest cache: evita iterar todo el buffer para scoring
// - Throttled emit: estado al frontend cada 200ms, no cada ciclo
// - Compact state: solo envía violations cuando cambian

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSuggestion {
    pub volume_delta: f64,
    pub pitch_delta: f64,
    pub reason: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpertSuggestion {
    pub severity: String,
    pub message: String,
    pub channel_id: String,
    pub suggested_action: String,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Messages — batch-oriented for efficiency
// ---------------------------------------------------------------------------

pub enum ControlMessage {
    /// Batch of biometric samples (reduces IPC overhead)
    SampleBatch(Vec<BiometricSample>),
    /// Single sample (kept for backward compat, but batch preferred)
    Sample(BiometricSample),
    UpdateThresholds(Vec<BiometricThreshold>),
    StartSession { session_id: String },
    StopSession,
    RequestState,
    Shutdown,
}

// ---------------------------------------------------------------------------
// Engine handle — lock-free ingestion via mpsc::Sender (Send, not Mutex)
// ---------------------------------------------------------------------------

/// The engine handle exposes an `mpsc::Sender` directly.
/// `mpsc::Sender` is `Send + Clone` — no Mutex needed on the hot path.
pub struct ClosedLoopEngine {
    sender: mpsc::Sender<ControlMessage>,
    state: Arc<Mutex<ClosedLoopState>>,
}

/// Shared handle. The outer Arc<Mutex> is only locked for get_state() reads,
/// NOT for sending samples (which goes through the cloned Sender).
pub type SharedClosedLoop = Arc<ClosedLoopEngine>;

impl ClosedLoopEngine {
    /// Send a message to the control thread. Lock-free — just mpsc::send.
    pub fn send(&self, msg: ControlMessage) -> Result<(), String> {
        self.sender
            .send(msg)
            .map_err(|e| format!("Control loop send error: {}", e))
    }

    /// Read current state (takes the Mutex, but only for reads — rare).
    pub fn get_state(&self) -> Result<ClosedLoopState, String> {
        self.state
            .lock()
            .map(|s| s.clone())
            .map_err(|e| format!("State lock error: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Per-channel latest value cache (avoids scanning the full buffer)
// ---------------------------------------------------------------------------

struct ChannelLatest {
    value: f64,
    timestamp: u64,
    eeg_bands: Option<EegBands>,
    sensor_type: BiometricSensorType,
}

// ---------------------------------------------------------------------------
// Relaxation score — O(1) from cached latest values
// ---------------------------------------------------------------------------

fn compute_relaxation_score(latest: &HashMap<String, ChannelLatest>) -> f64 {
    let mut score = 50.0;

    // EEG: find any channel with eeg_bands
    for cl in latest.values() {
        if let Some(bands) = &cl.eeg_bands {
            let calm = bands.alpha + bands.theta;
            let active = bands.beta + bands.gamma + 0.001;
            let ratio = calm / active;
            score += (ratio - 1.0).clamp(-25.0, 25.0) * 10.0;
            break; // use first EEG channel found
        }
    }

    // Pulse
    for cl in latest.values() {
        if matches!(cl.sensor_type, BiometricSensorType::Pulse) {
            score += (80.0 - cl.value) * 0.75;
            break;
        }
    }

    // GSR
    for cl in latest.values() {
        if matches!(cl.sensor_type, BiometricSensorType::Gsr) {
            score += (5.0 - cl.value).clamp(-10.0, 10.0);
            break;
        }
    }

    score.clamp(0.0, 100.0)
}

// ---------------------------------------------------------------------------
// Control loop thread
// ---------------------------------------------------------------------------

const LOOP_INTERVAL_MS: u64 = 100;   // 10 Hz evaluation
const EMIT_INTERVAL_MS: u64 = 200;   // 5 Hz state emit to frontend (was 10 Hz)
const SUGGESTION_COOLDOWN_MS: u64 = 1000; // 1 per second per channel max

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
        let mut latest: HashMap<String, ChannelLatest> = HashMap::new();
        let mut session_active = false;
        let mut session_id: Option<String> = None;
        let mut last_eval = Instant::now();
        let mut last_emit = Instant::now();
        let mut last_suggestion_per_channel: HashMap<String, u64> = HashMap::new();
        let mut prev_violation_count: usize = 0;

        loop {
            // Drain all pending messages
            loop {
                match rx.try_recv() {
                    Ok(ControlMessage::SampleBatch(samples)) => {
                        for sample in samples {
                            latest.insert(sample.channel_id.clone(), ChannelLatest {
                                value: sample.value,
                                timestamp: sample.timestamp,
                                eeg_bands: sample.eeg_bands.clone(),
                                sensor_type: sample.sensor_type.clone(),
                            });
                        }
                    }
                    Ok(ControlMessage::Sample(sample)) => {
                        latest.insert(sample.channel_id.clone(), ChannelLatest {
                            value: sample.value,
                            timestamp: sample.timestamp,
                            eeg_bands: sample.eeg_bands.clone(),
                            sensor_type: sample.sensor_type.clone(),
                        });
                    }
                    Ok(ControlMessage::UpdateThresholds(t)) => {
                        thresholds = t;
                    }
                    Ok(ControlMessage::StartSession { session_id: sid }) => {
                        session_active = true;
                        session_id = Some(sid);
                        latest.clear();
                        last_suggestion_per_channel.clear();
                        let _ = app_handle.emit("closed-loop-started", &session_id);
                    }
                    Ok(ControlMessage::StopSession) => {
                        session_active = false;
                        let stopped_id = session_id.take();
                        latest.clear();
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
                thread::sleep(Duration::from_millis(5));
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

            // --- Evaluate thresholds (O(thresholds) with O(1) lookup) ---
            let mut violations: Vec<ThresholdViolation> = Vec::new();

            for threshold in &thresholds {
                let cl = match latest.get(&threshold.channel_id) {
                    Some(cl) => cl,
                    None => continue,
                };

                let violated = cl.value < threshold.min || cl.value > threshold.max;
                if !violated {
                    continue;
                }

                violations.push(ThresholdViolation {
                    channel_id: threshold.channel_id.clone(),
                    sensor_type: threshold.sensor_type.clone(),
                    current_value: cl.value,
                    threshold_min: threshold.min,
                    threshold_max: threshold.max,
                    action: threshold.action.clone(),
                    timestamp: now_ms,
                });

                // Rate-limit suggestions per channel
                let last_ts = last_suggestion_per_channel
                    .get(&threshold.channel_id)
                    .copied()
                    .unwrap_or(0);

                if now_ms - last_ts >= SUGGESTION_COOLDOWN_MS {
                    last_suggestion_per_channel
                        .insert(threshold.channel_id.clone(), now_ms);

                    let severity = if (cl.value - threshold.max).abs() > 20.0
                        || (threshold.min - cl.value).abs() > 20.0
                    { "critical" } else { "warning" };

                    let _ = app_handle.emit("expert-suggestion", &ExpertSuggestion {
                        severity: severity.to_string(),
                        message: format!(
                            "{:?} canal {} = {:.2} (umbral: {:.1}–{:.1})",
                            threshold.sensor_type, threshold.channel_id,
                            cl.value, threshold.min, threshold.max
                        ),
                        channel_id: threshold.channel_id.clone(),
                        suggested_action: threshold.action.action_type.clone(),
                        timestamp: now_ms,
                    });

                    if threshold.action.action_type == "adjust_audio" {
                        let _ = app_handle.emit("audio-suggestion", &AudioSuggestion {
                            volume_delta: threshold.action.volume_delta.unwrap_or(0.0),
                            pitch_delta: threshold.action.pitch_delta.unwrap_or(0.0),
                            reason: format!("{:?} threshold on {}", threshold.sensor_type, threshold.channel_id),
                            timestamp: now_ms,
                        });
                    }
                }
            }

            // --- Relaxation score from cached latest values (O(channels)) ---
            let relaxation = compute_relaxation_score(&latest);

            // --- Update shared state ---
            if let Ok(mut st) = state_clone.lock() {
                st.active = session_active;
                st.session_id = session_id.clone();
                st.relaxation_score = relaxation;
                st.violations = violations.clone();
                st.last_cycle_timestamp = now_ms;
            }

            // --- Throttled emit to frontend (5 Hz instead of 10 Hz) ---
            if last_emit.elapsed() >= Duration::from_millis(EMIT_INTERVAL_MS) {
                // Only emit full state if violations changed or on regular interval
                let violation_count = violations.len();
                if violation_count != prev_violation_count
                    || last_emit.elapsed() >= Duration::from_millis(EMIT_INTERVAL_MS)
                {
                    if let Ok(s) = state_clone.lock() {
                        let _ = app_handle.emit("closed-loop-update", &*s);
                    }
                    prev_violation_count = violation_count;
                }
                last_emit = Instant::now();
            }
        }
    });

    Arc::new(ClosedLoopEngine {
        sender: tx,
        state,
    })
}
