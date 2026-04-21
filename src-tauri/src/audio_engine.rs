// src-tauri/src/audio_engine.rs
//
// Motor de audio progresivo para tanque de privación sensorial.
// Genera tonos binaurales y paisajes sonoros controlados dinámicamente
// por el motor de lazo cerrado. Usa rodio para síntesis y reproducción.
//
// Arquitectura:
// - Hilo dedicado con canal mpsc para recibir comandos
// - Generador de ondas sinusoidales con control de frecuencia y amplitud
// - Crossfade suave para transiciones sin clicks
// - El closed loop envía AudioSuggestion → este módulo ajusta en tiempo real

use rodio::{OutputStream, Sink, Source};
use serde::{Deserialize, Serialize};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Audio state & configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioState {
    pub playing: bool,
    pub volume: f32,         // 0.0–1.0
    pub base_freq: f32,      // Hz (left ear)
    pub binaural_offset: f32, // Hz difference for right ear
    pub fade_ms: u64,        // crossfade duration
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            playing: false,
            volume: 0.5,
            base_freq: 200.0,       // 200 Hz carrier
            binaural_offset: 4.0,   // 4 Hz = theta range binaural beat
            fade_ms: 2000,
        }
    }
}

// ---------------------------------------------------------------------------
// Commands for the audio thread
// ---------------------------------------------------------------------------

pub enum AudioMessage {
    /// Start audio playback
    Play,
    /// Stop audio playback (fade out)
    Stop,
    /// Set master volume (0.0–1.0), applied with smooth ramp
    SetVolume(f32),
    /// Set base frequency and binaural offset
    SetFrequencies { base_freq: f32, binaural_offset: f32 },
    /// Adjust from closed-loop: delta values applied gradually
    ClosedLoopAdjust { volume_delta: f32, pitch_delta: f32 },
    /// Shutdown the audio thread
    Shutdown,
}

// ---------------------------------------------------------------------------
// Binaural tone source
// ---------------------------------------------------------------------------

/// A simple stereo binaural beat generator.
/// Left channel: base_freq, Right channel: base_freq + offset
struct BinauralSource {
    sample_rate: u32,
    sample_idx: u64,
    base_freq: Arc<Mutex<f32>>,
    offset: Arc<Mutex<f32>>,
    amplitude: Arc<Mutex<f32>>,
}

impl BinauralSource {
    fn new(
        sample_rate: u32,
        base_freq: Arc<Mutex<f32>>,
        offset: Arc<Mutex<f32>>,
        amplitude: Arc<Mutex<f32>>,
    ) -> Self {
        Self {
            sample_rate,
            sample_idx: 0,
            base_freq,
            offset,
            amplitude,
        }
    }
}

impl Iterator for BinauralSource {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        let t = self.sample_idx as f64 / self.sample_rate as f64;
        let base = *self.base_freq.lock().unwrap_or_else(|e| e.into_inner()) as f64;
        let off = *self.offset.lock().unwrap_or_else(|e| e.into_inner()) as f64;
        let amp = *self.amplitude.lock().unwrap_or_else(|e| e.into_inner()) as f64;

        // Stereo interleaved: even samples = left, odd = right
        let is_left = self.sample_idx % 2 == 0;
        let freq = if is_left { base } else { base + off };

        // We advance time only on right channel (every 2 samples = 1 frame)
        if !is_left {
            self.sample_idx += 1;
        } else {
            self.sample_idx += 1;
        }

        let value = amp * (2.0 * std::f64::consts::PI * freq * t).sin();
        Some(value as f32)
    }
}

impl Source for BinauralSource {
    fn current_frame_len(&self) -> Option<usize> {
        None // infinite source
    }

    fn channels(&self) -> u16 {
        2 // stereo
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None // infinite
    }
}

// ---------------------------------------------------------------------------
// Engine handle
// ---------------------------------------------------------------------------

pub struct AudioEngine {
    sender: mpsc::Sender<AudioMessage>,
    state: Arc<Mutex<AudioState>>,
}

pub type SharedAudioEngine = Arc<Mutex<AudioEngine>>;

impl AudioEngine {
    pub fn send(&self, msg: AudioMessage) -> Result<(), String> {
        self.sender
            .send(msg)
            .map_err(|e| format!("Audio engine send error: {}", e))
    }

    pub fn get_state(&self) -> Result<AudioState, String> {
        self.state
            .lock()
            .map(|s| s.clone())
            .map_err(|e| format!("Audio state lock error: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Audio thread
// ---------------------------------------------------------------------------

const SAMPLE_RATE: u32 = 44100;

/// Starts the audio engine on a dedicated thread.
/// Returns a handle for sending commands from Tauri.
pub fn start_audio_engine() -> SharedAudioEngine {
    let (tx, rx) = mpsc::channel::<AudioMessage>();

    let state = Arc::new(Mutex::new(AudioState::default()));
    let state_clone = Arc::clone(&state);

    thread::spawn(move || {
        // Shared parameters that the BinauralSource reads in real-time
        let shared_freq = Arc::new(Mutex::new(200.0f32));
        let shared_offset = Arc::new(Mutex::new(4.0f32));
        let shared_amplitude = Arc::new(Mutex::new(0.0f32)); // start silent

        // Try to initialize audio output
        let output = match OutputStream::try_default() {
            Ok((stream, handle)) => Some((stream, handle)),
            Err(e) => {
                eprintln!("[audio_engine] No audio output available: {}. Running in silent mode.", e);
                None
            }
        };

        let sink = output.as_ref().map(|(_, handle)| {
            let sink = Sink::try_new(handle).expect("Failed to create audio sink");
            let source = BinauralSource::new(
                SAMPLE_RATE,
                Arc::clone(&shared_freq),
                Arc::clone(&shared_offset),
                Arc::clone(&shared_amplitude),
            );
            sink.append(source);
            sink.pause();
            sink
        });

        let mut target_volume: f32 = 0.5;
        let mut current_volume: f32 = 0.0;
        let mut playing = false;

        loop {
            // Process all pending messages
            loop {
                match rx.try_recv() {
                    Ok(AudioMessage::Play) => {
                        playing = true;
                        if let Some(ref s) = sink {
                            s.play();
                        }
                        if let Ok(mut st) = state_clone.lock() {
                            st.playing = true;
                        }
                    }
                    Ok(AudioMessage::Stop) => {
                        playing = false;
                        target_volume = 0.0;
                        if let Ok(mut st) = state_clone.lock() {
                            st.playing = false;
                        }
                    }
                    Ok(AudioMessage::SetVolume(v)) => {
                        target_volume = v.clamp(0.0, 1.0);
                        if let Ok(mut st) = state_clone.lock() {
                            st.volume = target_volume;
                        }
                    }
                    Ok(AudioMessage::SetFrequencies { base_freq, binaural_offset }) => {
                        if let Ok(mut f) = shared_freq.lock() {
                            *f = base_freq.clamp(20.0, 1000.0);
                        }
                        if let Ok(mut o) = shared_offset.lock() {
                            *o = binaural_offset.clamp(0.5, 40.0);
                        }
                        if let Ok(mut st) = state_clone.lock() {
                            st.base_freq = base_freq;
                            st.binaural_offset = binaural_offset;
                        }
                    }
                    Ok(AudioMessage::ClosedLoopAdjust { volume_delta, pitch_delta }) => {
                        // Apply gradual adjustments from the biometric closed loop
                        target_volume = (target_volume + volume_delta).clamp(0.0, 1.0);
                        if let Ok(mut o) = shared_offset.lock() {
                            // Shift binaural offset: deeper relaxation → lower beat freq
                            *o = (*o + pitch_delta).clamp(0.5, 40.0);
                        }
                        if let Ok(mut st) = state_clone.lock() {
                            st.volume = target_volume;
                            if let Ok(o) = shared_offset.lock() {
                                st.binaural_offset = *o;
                            }
                        }
                    }
                    Ok(AudioMessage::Shutdown) => {
                        if let Some(ref s) = sink {
                            s.stop();
                        }
                        return;
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => return,
                }
            }

            // Smooth volume ramping (avoid clicks)
            let ramp_speed = 0.02; // ~20ms steps at 50ms loop = ~500ms full ramp
            if (current_volume - target_volume).abs() > 0.001 {
                if current_volume < target_volume {
                    current_volume = (current_volume + ramp_speed).min(target_volume);
                } else {
                    current_volume = (current_volume - ramp_speed).max(target_volume);
                }
                if let Ok(mut a) = shared_amplitude.lock() {
                    *a = current_volume;
                }
            }

            // If faded out completely and not playing, pause the sink
            if !playing && current_volume < 0.001 {
                if let Some(ref s) = sink {
                    if !s.is_paused() {
                        s.pause();
                    }
                }
            }

            thread::sleep(Duration::from_millis(20));
        }
    });

    Arc::new(Mutex::new(AudioEngine {
        sender: tx,
        state,
    }))
}
