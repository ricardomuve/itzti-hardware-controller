// src-tauri/src/watchdog.rs
//
// Watchdog / Safe Mode manager.
//
// Sends periodic heartbeat commands to the MCU via serial port.
// If the MCU doesn't receive a heartbeat within its watchdog timeout
// (configured on the MCU side, typically 2–5 seconds), it enters
// safe mode and shuts down all power actuators.
//
// This module also:
// - Tracks heartbeat ACKs from the MCU
// - Detects missed heartbeats (app-side monitoring)
// - Can force safe mode via explicit command
// - Emits Tauri events when safe mode state changes

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

use crate::serial_port::{self, SharedPort};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Heartbeat interval in milliseconds. Must be well under the MCU's
/// watchdog timeout (e.g. if MCU timeout = 3s, send every 1s).
const HEARTBEAT_INTERVAL_MS: u64 = 1000;

/// Number of missed ACKs before the app considers the MCU unreachable.
const MAX_MISSED_HEARTBEATS: u32 = 3;

// ---------------------------------------------------------------------------
// Protocol constants (must match MCU firmware)
// ---------------------------------------------------------------------------

const CMD_HEARTBEAT: u8 = 0xF0;
const CMD_ENTER_SAFE_MODE: u8 = 0xF1;
const CMD_EXIT_SAFE_MODE: u8 = 0xF2;
const CMD_SAFE_MODE_ACK: u8 = 0xFE;

// ---------------------------------------------------------------------------
// Safe mode reasons
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SafeModeReason {
    WatchdogTimeout = 0x01,
    ManualTrigger = 0x02,
    HardwareFault = 0x03,
    OverTemperature = 0x04,
}

impl SafeModeReason {
    fn from_byte(b: u8) -> Self {
        match b {
            0x01 => Self::WatchdogTimeout,
            0x02 => Self::ManualTrigger,
            0x03 => Self::HardwareFault,
            0x04 => Self::OverTemperature,
            _ => Self::WatchdogTimeout,
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchdogState {
    pub heartbeat_active: bool,
    pub mcu_in_safe_mode: bool,
    pub safe_mode_reason: Option<SafeModeReason>,
    pub last_heartbeat_ack: u64,
    pub missed_heartbeats: u32,
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

pub enum WatchdogMessage {
    /// Start sending heartbeats
    Start,
    /// Stop sending heartbeats (will cause MCU watchdog timeout → safe mode)
    Stop,
    /// MCU acknowledged a heartbeat (received SafeModeAck with reason=0 or heartbeat echo)
    HeartbeatAck,
    /// MCU reported entering safe mode
    SafeModeEntered(SafeModeReason),
    /// Force the MCU into safe mode
    ForceSafeMode,
    /// Request MCU to exit safe mode and resume normal operation
    ExitSafeMode,
    /// Shutdown the watchdog thread
    Shutdown,
}

// ---------------------------------------------------------------------------
// Engine handle
// ---------------------------------------------------------------------------

pub struct WatchdogEngine {
    sender: mpsc::Sender<WatchdogMessage>,
    state: Arc<Mutex<WatchdogState>>,
}

pub type SharedWatchdog = Arc<WatchdogEngine>;

impl WatchdogEngine {
    pub fn send(&self, msg: WatchdogMessage) -> Result<(), String> {
        self.sender
            .send(msg)
            .map_err(|e| format!("Watchdog send error: {}", e))
    }

    pub fn get_state(&self) -> Result<WatchdogState, String> {
        self.state
            .lock()
            .map(|s| s.clone())
            .map_err(|e| format!("Watchdog state lock error: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Heartbeat packet builder
// ---------------------------------------------------------------------------

/// Builds a heartbeat command packet:
/// [0xF0] [0x00] [0x04] [4 bytes: timestamp_s big-endian]
fn build_heartbeat_packet() -> Vec<u8> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as u32;

    let mut pkt = Vec::with_capacity(7);
    pkt.push(CMD_HEARTBEAT);
    pkt.push(0x00); // payload length high byte
    pkt.push(0x04); // payload length low byte (4 bytes)
    pkt.extend_from_slice(&ts.to_be_bytes());
    pkt
}

/// Builds an enter-safe-mode command: [0xF1] [0x00] [0x00]
fn build_enter_safe_mode_packet() -> Vec<u8> {
    vec![CMD_ENTER_SAFE_MODE, 0x00, 0x00]
}

/// Builds an exit-safe-mode command: [0xF2] [0x00] [0x00]
fn build_exit_safe_mode_packet() -> Vec<u8> {
    vec![CMD_EXIT_SAFE_MODE, 0x00, 0x00]
}

// ---------------------------------------------------------------------------
// Watchdog thread
// ---------------------------------------------------------------------------

pub fn start_watchdog(
    shared_port: SharedPort,
    app_handle: tauri::AppHandle,
) -> SharedWatchdog {
    let (tx, rx) = mpsc::channel::<WatchdogMessage>();

    let state = Arc::new(Mutex::new(WatchdogState {
        heartbeat_active: false,
        mcu_in_safe_mode: false,
        safe_mode_reason: None,
        last_heartbeat_ack: 0,
        missed_heartbeats: 0,
    }));

    let state_clone = Arc::clone(&state);

    thread::spawn(move || {
        let mut active = false;
        let mut last_send = Instant::now();
        let mut missed: u32 = 0;
        let mut waiting_ack = false;
        let mut mcu_safe_mode = false;

        loop {
            // Drain messages
            loop {
                match rx.try_recv() {
                    Ok(WatchdogMessage::Start) => {
                        active = true;
                        missed = 0;
                        waiting_ack = false;
                        mcu_safe_mode = false;
                        if let Ok(mut st) = state_clone.lock() {
                            st.heartbeat_active = true;
                            st.mcu_in_safe_mode = false;
                            st.safe_mode_reason = None;
                            st.missed_heartbeats = 0;
                        }
                        let _ = app_handle.emit("watchdog-started", ());
                    }
                    Ok(WatchdogMessage::Stop) => {
                        active = false;
                        if let Ok(mut st) = state_clone.lock() {
                            st.heartbeat_active = false;
                        }
                        let _ = app_handle.emit("watchdog-stopped", ());
                    }
                    Ok(WatchdogMessage::HeartbeatAck) => {
                        missed = 0;
                        waiting_ack = false;
                        let now_ms = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        if let Ok(mut st) = state_clone.lock() {
                            st.last_heartbeat_ack = now_ms;
                            st.missed_heartbeats = 0;
                        }
                    }
                    Ok(WatchdogMessage::SafeModeEntered(reason)) => {
                        mcu_safe_mode = true;
                        if let Ok(mut st) = state_clone.lock() {
                            st.mcu_in_safe_mode = true;
                            st.safe_mode_reason = Some(reason);
                        }
                        let _ = app_handle.emit("safe-mode-entered", &reason);
                    }
                    Ok(WatchdogMessage::ForceSafeMode) => {
                        let pkt = build_enter_safe_mode_packet();
                        let _ = serial_port::write_to_port(&shared_port, &pkt);
                        mcu_safe_mode = true;
                        if let Ok(mut st) = state_clone.lock() {
                            st.mcu_in_safe_mode = true;
                            st.safe_mode_reason = Some(SafeModeReason::ManualTrigger);
                        }
                        let _ = app_handle.emit("safe-mode-entered", &SafeModeReason::ManualTrigger);
                    }
                    Ok(WatchdogMessage::ExitSafeMode) => {
                        let pkt = build_exit_safe_mode_packet();
                        let _ = serial_port::write_to_port(&shared_port, &pkt);
                        mcu_safe_mode = false;
                        missed = 0;
                        if let Ok(mut st) = state_clone.lock() {
                            st.mcu_in_safe_mode = false;
                            st.safe_mode_reason = None;
                            st.missed_heartbeats = 0;
                        }
                        let _ = app_handle.emit("safe-mode-exited", ());
                    }
                    Ok(WatchdogMessage::Shutdown) => return,
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => return,
                }
            }

            // Send heartbeat at fixed interval
            if active && !mcu_safe_mode && last_send.elapsed() >= Duration::from_millis(HEARTBEAT_INTERVAL_MS) {
                // Check if previous heartbeat was ACKed
                if waiting_ack {
                    missed += 1;
                    if let Ok(mut st) = state_clone.lock() {
                        st.missed_heartbeats = missed;
                    }

                    if missed >= MAX_MISSED_HEARTBEATS {
                        // MCU is unreachable — it should have entered safe mode
                        // via its own watchdog, but we track it app-side too
                        mcu_safe_mode = true;
                        if let Ok(mut st) = state_clone.lock() {
                            st.mcu_in_safe_mode = true;
                            st.safe_mode_reason = Some(SafeModeReason::WatchdogTimeout);
                        }
                        let _ = app_handle.emit("safe-mode-entered", &SafeModeReason::WatchdogTimeout);
                        let _ = app_handle.emit("watchdog-timeout", &missed);
                    }
                }

                // Send heartbeat packet
                let pkt = build_heartbeat_packet();
                if serial_port::write_to_port(&shared_port, &pkt).is_ok() {
                    waiting_ack = true;
                } else {
                    // Port write failed — count as missed
                    missed += 1;
                    if let Ok(mut st) = state_clone.lock() {
                        st.missed_heartbeats = missed;
                    }
                }

                last_send = Instant::now();
            }

            thread::sleep(Duration::from_millis(100));
        }
    });

    Arc::new(WatchdogEngine {
        sender: tx,
        state,
    })
}

/// Call this when a SafeModeAck (0xFE) packet is received from the MCU.
/// Parses the reason byte and notifies the watchdog thread.
pub fn handle_safe_mode_ack(watchdog: &SharedWatchdog, payload: &[u8]) {
    if payload.is_empty() {
        // Empty payload = heartbeat ACK (MCU is alive)
        let _ = watchdog.send(WatchdogMessage::HeartbeatAck);
    } else {
        // Payload[0] = safe mode reason
        let reason = SafeModeReason::from_byte(payload[0]);
        let _ = watchdog.send(WatchdogMessage::SafeModeEntered(reason));
    }
}
