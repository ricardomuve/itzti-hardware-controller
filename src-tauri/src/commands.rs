use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use crate::adc_driver::{self, AdcReading, SharedAdc};
use crate::i2c_driver::{self, I2cBusInfo, I2cConfig, SharedI2c};
use crate::serial_port::{self, SerialPortInfo, SharedPort};
use crate::spi_driver::{self, SharedSpi, SpiBusInfo, SpiConfig};

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Lists all available serial ports on the system.
///
/// Returns port information including path, manufacturer, vendor ID and product ID.
/// Satisfies Requirements 8.2, 10.1.
#[tauri::command]
pub fn list_ports() -> Result<Vec<SerialPortInfo>, String> {
    serial_port::list_serial_ports().map_err(|e| e.message)
}

/// Opens a serial port connection and starts a background reader thread
/// that emits `serial-data`, `serial-disconnect`, and `serial-error` events.
///
/// Satisfies Requirements 8.2, 8.3, 10.1.
#[tauri::command]
pub fn connect_port(
    port_path: String,
    baud_rate: u32,
    shared_port: State<'_, SharedPort>,
    app_handle: AppHandle,
) -> Result<(), String> {
    serial_port::open_port(&shared_port, &port_path, baud_rate).map_err(|e| e.message)?;

    // Spawn a background thread that continuously reads from the serial port
    // and emits Tauri events for incoming data, disconnections, and errors.
    let reader_port = shared_port.inner().clone();
    thread::spawn(move || {
        loop {
            // Check if the port is still open
            {
                let guard = match reader_port.lock() {
                    Ok(g) => g,
                    Err(_) => {
                        let _ = app_handle.emit("serial-error", "Failed to acquire port lock");
                        break;
                    }
                };
                if guard.is_none() {
                    // Port was closed (normal disconnect), stop the reader
                    break;
                }
            }

            // Attempt to read data from the port
            match serial_port::read_from_port(&reader_port) {
                Ok(data) => {
                    if !data.is_empty() {
                        // Emit serial-data event with the received bytes as Vec<u8>
                        let _ = app_handle.emit("serial-data", data);
                    }
                }
                Err(e) => {
                    // Check if this is a disconnection error
                    let msg = e.message.clone();
                    if msg.contains("disconnected")
                        || msg.contains("No port is currently open")
                        || msg.contains("broken pipe")
                        || msg.contains("device not configured")
                        || msg.contains("Access is denied")
                    {
                        let _ = app_handle.emit("serial-disconnect", ());
                        break;
                    }
                    // Emit error event for other errors
                    let _ = app_handle.emit("serial-error", msg);
                }
            }

            // Small sleep to avoid busy-waiting
            thread::sleep(Duration::from_millis(10));
        }
    });

    Ok(())
}

/// Closes the currently active serial port connection.
///
/// The background reader thread will detect the closed port and stop automatically.
/// Satisfies Requirements 8.2, 10.1.
#[tauri::command]
pub fn disconnect_port(shared_port: State<'_, SharedPort>) -> Result<(), String> {
    serial_port::close_port(&shared_port).map_err(|e| e.message)
}

/// Writes data bytes to the currently active serial port.
///
/// Satisfies Requirements 8.2, 10.1.
#[tauri::command]
pub fn write_data(data: Vec<u8>, shared_port: State<'_, SharedPort>) -> Result<(), String> {
    serial_port::write_to_port(&shared_port, &data).map_err(|e| e.message)
}

/// Reads a single ADC sample from the specified channel.
///
/// Returns an `AdcReading` with raw value, voltage, channel, and timestamp.
/// Satisfies Requirements 8.3, 10.1.
#[tauri::command]
pub fn read_adc(channel: u8, shared_adc: State<'_, SharedAdc>) -> Result<AdcReading, String> {
    adc_driver::read_adc_channel(&shared_adc, channel).map_err(|e| e.message)
}

// ---------------------------------------------------------------------------
// I2C commands
// ---------------------------------------------------------------------------

/// Lists all available I2C buses on the system.
///
/// Returns bus information including bus number, path, and accessibility.
/// Satisfies Requirements 1.1, 1.4.
#[tauri::command]
pub fn list_i2c_buses() -> Result<Vec<I2cBusInfo>, String> {
    i2c_driver::list_i2c_buses().map_err(|e| e.message)
}

/// Scans an I2C bus for connected devices by probing addresses 0x03–0x77.
///
/// Returns a list of addresses that responded.
/// Satisfies Requirements 2.1, 2.4.
#[tauri::command]
pub fn scan_i2c(bus_number: u8) -> Result<Vec<u16>, String> {
    i2c_driver::scan_i2c_bus(bus_number).map_err(|e| e.message)
}

/// Configures an I2C bus with the specified clock speed and address mode.
///
/// Satisfies Requirements 3.1, 3.2, 3.3.
#[tauri::command]
pub fn configure_i2c(config: I2cConfig, shared: State<'_, SharedI2c>) -> Result<(), String> {
    i2c_driver::configure_i2c(&shared, config).map_err(|e| e.message)
}

/// Reads bytes from an I2C device at the specified address.
///
/// Satisfies Requirements 5.1, 5.5, 5.6.
#[tauri::command]
pub fn i2c_read(bus_number: u8, address: u16, length: usize) -> Result<Vec<u8>, String> {
    i2c_driver::i2c_read(bus_number, address, length).map_err(|e| e.message)
}

/// Writes bytes to an I2C device at the specified address.
///
/// Satisfies Requirements 5.2, 5.5, 5.6.
#[tauri::command]
pub fn i2c_write(bus_number: u8, address: u16, data: Vec<u8>) -> Result<(), String> {
    i2c_driver::i2c_write(bus_number, address, &data).map_err(|e| e.message)
}

/// Writes bytes then reads from an I2C device as an atomic transaction.
///
/// Satisfies Requirements 5.3, 5.5, 5.6.
#[tauri::command]
pub fn i2c_write_read(
    bus_number: u8,
    address: u16,
    write_data: Vec<u8>,
    read_length: usize,
) -> Result<Vec<u8>, String> {
    i2c_driver::i2c_write_read(bus_number, address, &write_data, read_length)
        .map_err(|e| e.message)
}

/// Starts continuous reading from an I2C device on a background thread.
///
/// Emits `i2c-sensor-data` events at the specified sample rate.
/// Satisfies Requirements 7.1, 7.2, 7.5.
#[tauri::command]
pub fn start_i2c_continuous(
    bus_number: u8,
    address: u16,
    read_length: usize,
    sample_rate_hz: u32,
    shared: State<'_, SharedI2c>,
    app: AppHandle,
) -> Result<(), String> {
    i2c_driver::start_continuous_reading(
        &shared,
        bus_number,
        address,
        read_length,
        sample_rate_hz,
        app,
    )
    .map_err(|e| e.message)
}

/// Stops continuous reading from an I2C device.
///
/// Satisfies Requirement 7.3.
#[tauri::command]
pub fn stop_i2c_continuous(
    bus_number: u8,
    address: u16,
    shared: State<'_, SharedI2c>,
) -> Result<(), String> {
    i2c_driver::stop_continuous_reading(&shared, bus_number, address).map_err(|e| e.message)
}

// ---------------------------------------------------------------------------
// SPI commands
// ---------------------------------------------------------------------------

/// Lists all available SPI buses on the system.
///
/// Returns bus information including bus number, chip select, path, and accessibility.
/// Satisfies Requirements 1.2, 6.5.
#[tauri::command]
pub fn list_spi_buses() -> Result<Vec<SpiBusInfo>, String> {
    spi_driver::list_spi_buses().map_err(|e| e.message)
}

/// Configures an SPI bus with the specified clock speed, mode, and bit order.
///
/// Satisfies Requirements 4.1, 4.2, 4.3, 4.4.
#[tauri::command]
pub fn configure_spi(config: SpiConfig, shared: State<'_, SharedSpi>) -> Result<(), String> {
    spi_driver::configure_spi(&shared, config).map_err(|e| e.message)
}

/// Performs a full-duplex SPI transfer.
///
/// Sends tx_data and returns the simultaneously received bytes.
/// Satisfies Requirements 6.1, 6.5, 6.6.
#[tauri::command]
pub fn spi_transfer(
    bus_number: u8,
    chip_select: u8,
    tx_data: Vec<u8>,
    shared: State<'_, SharedSpi>,
) -> Result<Vec<u8>, String> {
    spi_driver::spi_transfer(&shared, bus_number, chip_select, &tx_data).map_err(|e| e.message)
}

/// Writes data to an SPI device, discarding received bytes.
///
/// Satisfies Requirements 6.2, 6.5, 6.6.
#[tauri::command]
pub fn spi_write(
    bus_number: u8,
    chip_select: u8,
    data: Vec<u8>,
    shared: State<'_, SharedSpi>,
) -> Result<(), String> {
    spi_driver::spi_write(&shared, bus_number, chip_select, &data).map_err(|e| e.message)
}

/// Reads bytes from an SPI device by sending zero bytes.
///
/// Satisfies Requirements 6.3, 6.5, 6.6.
#[tauri::command]
pub fn spi_read(
    bus_number: u8,
    chip_select: u8,
    length: usize,
    shared: State<'_, SharedSpi>,
) -> Result<Vec<u8>, String> {
    spi_driver::spi_read(&shared, bus_number, chip_select, length).map_err(|e| e.message)
}

/// Starts continuous reading from an SPI device on a background thread.
///
/// Emits `spi-sensor-data` events at the specified sample rate.
/// Satisfies Requirements 7.1, 7.2, 7.5.
#[tauri::command]
pub fn start_spi_continuous(
    bus_number: u8,
    chip_select: u8,
    tx_data: Vec<u8>,
    sample_rate_hz: u32,
    shared: State<'_, SharedSpi>,
    app: AppHandle,
) -> Result<(), String> {
    spi_driver::start_continuous_reading(
        &shared,
        bus_number,
        chip_select,
        &tx_data,
        sample_rate_hz,
        app,
    )
    .map_err(|e| e.message)
}

/// Stops continuous reading from an SPI device.
///
/// Satisfies Requirement 7.3.
#[tauri::command]
pub fn stop_spi_continuous(
    bus_number: u8,
    chip_select: u8,
    shared: State<'_, SharedSpi>,
) -> Result<(), String> {
    spi_driver::stop_continuous_reading(&shared, bus_number, chip_select).map_err(|e| e.message)
}


// ---------------------------------------------------------------------------
// Closed-loop biometric control commands
// ---------------------------------------------------------------------------

use crate::closed_loop::{
    BiometricSample, BiometricThreshold, ClosedLoopState, ControlMessage, SharedClosedLoop,
};

/// Pushes a batch of biometric samples into the closed-loop engine.
/// This is the preferred ingestion path — reduces IPC overhead from
/// 1 invoke per sample to 1 invoke per batch (e.g. 50 samples at once).
///
/// Lock-free: SharedClosedLoop is Arc<Engine>, send() uses mpsc directly.
#[tauri::command]
pub fn push_biometric_batch(
    samples: Vec<BiometricSample>,
    engine: State<'_, SharedClosedLoop>,
) -> Result<(), String> {
    engine.send(ControlMessage::SampleBatch(samples))
}

/// Pushes a single biometric sample (backward compat, prefer batch).
#[tauri::command]
pub fn push_biometric_sample(
    sample: BiometricSample,
    engine: State<'_, SharedClosedLoop>,
) -> Result<(), String> {
    engine.send(ControlMessage::Sample(sample))
}

/// Updates the threshold configuration for the closed-loop engine.
#[tauri::command]
pub fn update_thresholds(
    thresholds: Vec<BiometricThreshold>,
    engine: State<'_, SharedClosedLoop>,
) -> Result<(), String> {
    engine.send(ControlMessage::UpdateThresholds(thresholds))
}

/// Starts a closed-loop biometric session.
#[tauri::command]
pub fn start_biometric_session(
    session_id: String,
    engine: State<'_, SharedClosedLoop>,
) -> Result<(), String> {
    engine.send(ControlMessage::StartSession { session_id })
}

/// Stops the current biometric session.
#[tauri::command]
pub fn stop_biometric_session(
    engine: State<'_, SharedClosedLoop>,
) -> Result<(), String> {
    engine.send(ControlMessage::StopSession)
}

/// Returns the current closed-loop state.
#[tauri::command]
pub fn get_closed_loop_state(
    engine: State<'_, SharedClosedLoop>,
) -> Result<ClosedLoopState, String> {
    engine.get_state()
}


// ---------------------------------------------------------------------------
// Session database commands
// ---------------------------------------------------------------------------

use crate::session_db::{DbMessage, SessionRecord, SessionSummary, SharedDbWriter};

/// Creates a new session record in the database.
#[tauri::command]
pub fn db_create_session(
    session_id: String,
    preset_id: Option<String>,
    notes: Option<String>,
    db: State<'_, SharedDbWriter>,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    db.send(DbMessage::CreateSession(SessionRecord {
        id: session_id,
        started_at: now,
        ended_at: None,
        preset_id,
        notes,
    }))
}

/// Ends a session (sets ended_at timestamp and flushes pending data).
#[tauri::command]
pub fn db_end_session(
    session_id: String,
    db: State<'_, SharedDbWriter>,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    db.send(DbMessage::EndSession {
        session_id,
        ended_at: now,
    })
}

/// Pushes a biometric sample to the database writer (buffered, non-blocking).
#[tauri::command]
pub fn db_push_sample(
    session_id: String,
    sample: crate::closed_loop::BiometricSample,
    db: State<'_, SharedDbWriter>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    db.send(DbMessage::PushSample { session_id, sample })
}

/// Records a threshold violation event in the database.
#[tauri::command]
pub fn db_push_event(
    session_id: String,
    violation: crate::closed_loop::ThresholdViolation,
    db: State<'_, SharedDbWriter>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    db.send(DbMessage::PushEvent {
        session_id,
        violation,
    })
}

/// Forces a flush of buffered samples to disk.
#[tauri::command]
pub fn db_flush(db: State<'_, SharedDbWriter>) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    db.send(DbMessage::Flush)
}

/// Lists all sessions with summary info (sample count, event count).
///
/// This reads directly from SQLite (read path is separate from write path).
#[tauri::command]
pub fn db_list_sessions(db_path: State<'_, DbPath>) -> Result<Vec<SessionSummary>, String> {
    let conn = rusqlite::Connection::open(&db_path.0)
        .map_err(|e| format!("DB open error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.started_at, s.ended_at, s.preset_id, s.notes,
                    COALESCE(sc.cnt, 0) AS sample_count,
                    COALESCE(ec.cnt, 0) AS event_count
             FROM sessions s
             LEFT JOIN (SELECT session_id, COUNT(*) AS cnt FROM biometric_samples GROUP BY session_id) sc
               ON sc.session_id = s.id
             LEFT JOIN (SELECT session_id, COUNT(*) AS cnt FROM threshold_events GROUP BY session_id) ec
               ON ec.session_id = s.id
             ORDER BY s.started_at DESC",
        )
        .map_err(|e| format!("Prepare error: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                preset_id: row.get(3)?,
                notes: row.get(4)?,
                sample_count: row.get(5)?,
                event_count: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| format!("Row error: {}", e))?);
    }
    Ok(sessions)
}

/// Wrapper to hold the DB path for read-only queries.
pub struct DbPath(pub std::path::PathBuf);


// ---------------------------------------------------------------------------
// Audio engine commands
// ---------------------------------------------------------------------------

use crate::audio_engine::{AudioMessage, AudioState, SharedAudioEngine};

/// Starts audio playback (binaural tones).
#[tauri::command]
pub fn audio_play(engine: State<'_, SharedAudioEngine>) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;
    engine.send(AudioMessage::Play)
}

/// Stops audio playback with fade-out.
#[tauri::command]
pub fn audio_stop(engine: State<'_, SharedAudioEngine>) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;
    engine.send(AudioMessage::Stop)
}

/// Sets the master volume (0.0–1.0).
#[tauri::command]
pub fn audio_set_volume(volume: f32, engine: State<'_, SharedAudioEngine>) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;
    engine.send(AudioMessage::SetVolume(volume))
}

/// Sets the base frequency and binaural beat offset.
#[tauri::command]
pub fn audio_set_frequencies(
    base_freq: f32,
    binaural_offset: f32,
    engine: State<'_, SharedAudioEngine>,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;
    engine.send(AudioMessage::SetFrequencies {
        base_freq,
        binaural_offset,
    })
}

/// Returns the current audio engine state.
#[tauri::command]
pub fn audio_get_state(engine: State<'_, SharedAudioEngine>) -> Result<AudioState, String> {
    let engine = engine.lock().map_err(|e| format!("Lock error: {}", e))?;
    engine.get_state()
}


// ---------------------------------------------------------------------------
// Watchdog / Safe Mode commands
// ---------------------------------------------------------------------------

use crate::watchdog::{SharedWatchdog, WatchdogMessage, WatchdogState};

/// Starts the heartbeat sender. Call after connecting to the MCU.
#[tauri::command]
pub fn watchdog_start(engine: State<'_, SharedWatchdog>) -> Result<(), String> {
    engine.send(WatchdogMessage::Start)
}

/// Stops the heartbeat sender. The MCU will enter safe mode after its
/// watchdog timeout expires.
#[tauri::command]
pub fn watchdog_stop(engine: State<'_, SharedWatchdog>) -> Result<(), String> {
    engine.send(WatchdogMessage::Stop)
}

/// Forces the MCU into safe mode immediately (sends EnterSafeMode command).
#[tauri::command]
pub fn watchdog_force_safe_mode(engine: State<'_, SharedWatchdog>) -> Result<(), String> {
    engine.send(WatchdogMessage::ForceSafeMode)
}

/// Requests the MCU to exit safe mode and resume normal operation.
#[tauri::command]
pub fn watchdog_exit_safe_mode(engine: State<'_, SharedWatchdog>) -> Result<(), String> {
    engine.send(WatchdogMessage::ExitSafeMode)
}

/// Returns the current watchdog state.
#[tauri::command]
pub fn watchdog_get_state(engine: State<'_, SharedWatchdog>) -> Result<WatchdogState, String> {
    engine.get_state()
}


// ---------------------------------------------------------------------------
// Safe mode defaults query
// ---------------------------------------------------------------------------

/// Returns the complete safe mode parameter table for UI display.
#[tauri::command]
pub fn get_safe_mode_defaults() -> Vec<crate::safe_mode_defaults::SafeModeParam> {
    crate::safe_mode_defaults::SAFE_MODE_PARAMS.to_vec()
}
