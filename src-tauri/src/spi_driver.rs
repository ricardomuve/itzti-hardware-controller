// src-tauri/src/spi_driver.rs
//
// SPI driver module — types, state, and error constants.

use serde::{Deserialize, Serialize};
use spidev::{Spidev, SpidevOptions, SpidevTransfer, SpiModeFlags};
use std::collections::HashMap;
use std::io::prelude::*;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Error code constants
// ---------------------------------------------------------------------------

pub const ERR_BUS_NOT_FOUND: &str = "BUS_NOT_FOUND";
pub const ERR_PERMISSION_DENIED: &str = "PERMISSION_DENIED";
pub const ERR_INVALID_CLOCK_SPEED: &str = "INVALID_CLOCK_SPEED";
pub const ERR_INVALID_SPI_MODE: &str = "INVALID_SPI_MODE";
pub const ERR_BUS_ERROR: &str = "BUS_ERROR";
pub const ERR_INVALID_CONFIG: &str = "INVALID_CONFIG";
pub const ERR_CONTINUOUS_FAILED: &str = "CONTINUOUS_FAILED";
pub const ERR_INVALID_SAMPLE_RATE: &str = "INVALID_SAMPLE_RATE";
pub const ERR_ALREADY_READING: &str = "ALREADY_READING";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Error type for SPI operations, with a machine-readable code and a
/// human-readable message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpiError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for SpiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Information about an SPI bus available on the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpiBusInfo {
    pub bus_number: u8,
    pub chip_select: u8,
    pub path: String,
    pub accessible: bool,
    pub error_message: Option<String>,
}

/// SPI clock polarity and phase mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SpiMode {
    /// CPOL=0, CPHA=0
    Mode0,
    /// CPOL=0, CPHA=1
    Mode1,
    /// CPOL=1, CPHA=0
    Mode2,
    /// CPOL=1, CPHA=1
    Mode3,
}

/// SPI bit transmission order.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SpiBitOrder {
    MsbFirst,
    LsbFirst,
}

/// Configuration for an SPI bus.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpiConfig {
    pub bus_number: u8,
    pub chip_select: u8,
    pub clock_speed_hz: u32,
    pub mode: SpiMode,
    pub bits_per_word: u8,
    pub bit_order: SpiBitOrder,
}

/// Result of a full-duplex SPI transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpiTransferResult {
    pub tx_data: Vec<u8>,
    pub rx_data: Vec<u8>,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Internal state for the SPI driver.
pub struct SpiState {
    pub configs: HashMap<(u8, u8), SpiConfig>,
    pub continuous_readers: HashMap<(u8, u8), bool>,
}

/// Thread-safe shared SPI state.
pub type SharedSpi = Arc<Mutex<SpiState>>;

/// Creates a new shared SPI state with empty configuration and no active
/// continuous readers.
pub fn create_shared_spi() -> SharedSpi {
    Arc::new(Mutex::new(SpiState {
        configs: HashMap::new(),
        continuous_readers: HashMap::new(),
    }))
}

// ---------------------------------------------------------------------------
// Bus enumeration
// ---------------------------------------------------------------------------

/// Enumerates all SPI buses available on the system by scanning `/dev/spidev*`.
///
/// For each matching device file with the pattern `spidevB.C` (where B is the
/// bus number and C is the chip select), the function extracts both values and
/// checks whether the current process has read/write access. Buses without
/// proper permissions are still returned but marked as `accessible: false` with
/// a descriptive `error_message`.
///
/// The returned list is sorted by bus number first, then by chip select.
pub fn list_spi_buses() -> Result<Vec<SpiBusInfo>, SpiError> {
    let dev_dir = std::path::Path::new("/dev");

    let entries = std::fs::read_dir(dev_dir).map_err(|e| SpiError {
        code: ERR_BUS_NOT_FOUND.to_string(),
        message: format!("Failed to read /dev directory: {}", e),
    })?;

    let mut buses: Vec<SpiBusInfo> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // Match pattern "spidevB.C" where B and C are numbers
        if let Some(suffix) = name.strip_prefix("spidev") {
            if let Some((bus_str, cs_str)) = suffix.split_once('.') {
                if let (Ok(bus_number), Ok(chip_select)) =
                    (bus_str.parse::<u8>(), cs_str.parse::<u8>())
                {
                    let path = format!("/dev/{}", name);

                    let (accessible, error_message) = check_spi_bus_access(&path);

                    buses.push(SpiBusInfo {
                        bus_number,
                        chip_select,
                        path,
                        accessible,
                        error_message,
                    });
                }
            }
        }
    }

    // Sort by bus number, then chip select for deterministic output
    buses.sort_by(|a, b| a.bus_number.cmp(&b.bus_number).then(a.chip_select.cmp(&b.chip_select)));

    Ok(buses)
}

/// Checks whether the given SPI device path is readable and writable.
/// Returns `(accessible, error_message)`.
fn check_spi_bus_access(path: &str) -> (bool, Option<String>) {
    match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
    {
        Ok(_) => (true, None),
        Err(e) => {
            let message = match e.kind() {
                std::io::ErrorKind::PermissionDenied => {
                    format!(
                        "Permission denied for {}. Try running with sudo or add user to spi group.",
                        path
                    )
                }
                std::io::ErrorKind::NotFound => {
                    format!("Device {} not found.", path)
                }
                _ => {
                    format!("Cannot access {}: {}", path, e)
                }
            };
            (false, Some(message))
        }
    }
}

// ---------------------------------------------------------------------------
// Bus configuration
// ---------------------------------------------------------------------------

/// Minimum valid SPI clock speed in Hz (100 kHz).
const SPI_MIN_CLOCK_SPEED_HZ: u32 = 100_000;

/// Maximum valid SPI clock speed in Hz (50 MHz).
const SPI_MAX_CLOCK_SPEED_HZ: u32 = 50_000_000;

/// Maps an `SpiMode` to its corresponding (CPOL, CPHA) tuple.
///
/// | Mode   | CPOL | CPHA |
/// |--------|------|------|
/// | Mode0  |  0   |  0   |
/// | Mode1  |  0   |  1   |
/// | Mode2  |  1   |  0   |
/// | Mode3  |  1   |  1   |
pub fn spi_mode_to_flags(mode: &SpiMode) -> (u8, u8) {
    match mode {
        SpiMode::Mode0 => (0, 0),
        SpiMode::Mode1 => (0, 1),
        SpiMode::Mode2 => (1, 0),
        SpiMode::Mode3 => (1, 1),
    }
}

/// Configures an SPI bus by validating the clock speed and persisting the
/// configuration in the shared state.
///
/// The `mode` and `bit_order` fields are enums and are therefore always valid
/// by construction — no additional validation is needed for them.
///
/// # Errors
///
/// Returns `SpiError` with code `INVALID_CLOCK_SPEED` if `config.clock_speed_hz`
/// is not in the range [100_000, 50_000_000].
pub fn configure_spi(shared: &SharedSpi, config: SpiConfig) -> Result<(), SpiError> {
    // Validate clock speed range
    if config.clock_speed_hz < SPI_MIN_CLOCK_SPEED_HZ
        || config.clock_speed_hz > SPI_MAX_CLOCK_SPEED_HZ
    {
        return Err(SpiError {
            code: ERR_INVALID_CLOCK_SPEED.to_string(),
            message: format!(
                "Invalid clock speed {} Hz. Valid range: {} Hz to {} Hz.",
                config.clock_speed_hz, SPI_MIN_CLOCK_SPEED_HZ, SPI_MAX_CLOCK_SPEED_HZ
            ),
        });
    }

    // Persist configuration in shared state keyed by (bus_number, chip_select)
    let mut state = shared.lock().map_err(|e| SpiError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire SPI state lock: {}", e),
    })?;

    state
        .configs
        .insert((config.bus_number, config.chip_select), config);

    Ok(())
}

// ---------------------------------------------------------------------------
// SPI transfer operations
// ---------------------------------------------------------------------------

/// Maps an `SpiMode` enum to the corresponding `SpiModeFlags` constant.
fn spi_mode_to_mode_flags(mode: &SpiMode) -> SpiModeFlags {
    match mode {
        SpiMode::Mode0 => SpiModeFlags::SPI_MODE_0,
        SpiMode::Mode1 => SpiModeFlags::SPI_MODE_1,
        SpiMode::Mode2 => SpiModeFlags::SPI_MODE_2,
        SpiMode::Mode3 => SpiModeFlags::SPI_MODE_3,
    }
}

/// Maps a low-level `std::io::Error` from `spidev` into a typed `SpiError`.
///
/// The mapping inspects the `ErrorKind` to choose the most specific error code:
/// - `NotFound`         → `BUS_NOT_FOUND`
/// - `PermissionDenied` → `PERMISSION_DENIED`
/// - Other              → `BUS_ERROR`
fn map_io_error(e: &std::io::Error, bus: u8, cs: u8) -> SpiError {
    match e.kind() {
        std::io::ErrorKind::NotFound => SpiError {
            code: ERR_BUS_NOT_FOUND.to_string(),
            message: format!("SPI bus {}.{} not found at /dev/spidev{}.{}", bus, cs, bus, cs),
        },
        std::io::ErrorKind::PermissionDenied => SpiError {
            code: ERR_PERMISSION_DENIED.to_string(),
            message: format!(
                "Permission denied for /dev/spidev{}.{}. Try running with sudo or add user to spi group.",
                bus, cs
            ),
        },
        _ => SpiError {
            code: ERR_BUS_ERROR.to_string(),
            message: format!(
                "SPI bus error on bus {}.{}: {}",
                bus, cs, e
            ),
        },
    }
}

/// Opens an SPI device at `/dev/spidevB.C` and configures it with the stored
/// settings from the shared state (if available), or sensible defaults.
///
/// Returns the configured `Spidev` handle or an `SpiError`.
fn open_spi_device(shared: &SharedSpi, bus: u8, cs: u8) -> Result<Spidev, SpiError> {
    let path = format!("/dev/spidev{}.{}", bus, cs);

    let mut spi = Spidev::open(&path).map_err(|e| map_io_error(&e, bus, cs))?;

    // Read stored config (if any) to configure the device
    let state = shared.lock().map_err(|e| SpiError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire SPI state lock: {}", e),
    })?;

    let mut opts = SpidevOptions::new();

    if let Some(config) = state.configs.get(&(bus, cs)) {
        opts.max_speed_hz(config.clock_speed_hz);
        opts.mode(spi_mode_to_mode_flags(&config.mode));
        opts.bits_per_word(config.bits_per_word);
        opts.lsb_first(config.bit_order == SpiBitOrder::LsbFirst);
    } else {
        // Sensible defaults
        opts.max_speed_hz(1_000_000);
        opts.mode(SpiModeFlags::SPI_MODE_0);
        opts.bits_per_word(8);
        opts.lsb_first(false);
    }

    drop(state); // Release lock before I/O

    spi.configure(&opts.build()).map_err(|e| map_io_error(&e, bus, cs))?;

    Ok(spi)
}

/// Performs a full-duplex SPI transfer: sends `tx_data` and simultaneously
/// receives the same number of bytes.
///
/// Returns the received bytes.
///
/// # Errors
///
/// Returns `SpiError` with the appropriate code if the bus is not found,
/// permissions are insufficient, or the transfer fails.
pub fn spi_transfer(shared: &SharedSpi, bus: u8, cs: u8, tx_data: &[u8]) -> Result<Vec<u8>, SpiError> {
    let mut spi = open_spi_device(shared, bus, cs)?;

    let mut rx_buf = vec![0u8; tx_data.len()];
    {
        let mut transfer = SpidevTransfer::read_write(tx_data, &mut rx_buf);
        spi.transfer(&mut transfer).map_err(|e| map_io_error(&e, bus, cs))?;
    }

    Ok(rx_buf)
}

/// Writes data to an SPI device, discarding any received bytes.
///
/// This is equivalent to a full-duplex transfer where the received data is
/// ignored.
///
/// # Errors
///
/// Returns `SpiError` with the appropriate code if the bus is not found,
/// permissions are insufficient, or the write fails.
pub fn spi_write(shared: &SharedSpi, bus: u8, cs: u8, data: &[u8]) -> Result<(), SpiError> {
    let mut spi = open_spi_device(shared, bus, cs)?;

    spi.write_all(data).map_err(|e| map_io_error(&e, bus, cs))?;

    Ok(())
}

/// Creates a zero-filled TX buffer of the given length for SPI read operations.
///
/// This is a helper that can be tested independently to verify Property 7
/// (SPI read generates zero-filled TX buffer).
pub fn create_read_tx_buffer(length: usize) -> Vec<u8> {
    vec![0u8; length]
}

/// Reads `length` bytes from an SPI device by sending zero bytes and returning
/// the received data.
///
/// Internally creates a zero-filled TX buffer of `length` bytes and performs
/// a full-duplex transfer.
///
/// # Errors
///
/// Returns `SpiError` with the appropriate code if the bus is not found,
/// permissions are insufficient, or the transfer fails.
pub fn spi_read(shared: &SharedSpi, bus: u8, cs: u8, length: usize) -> Result<Vec<u8>, SpiError> {
    let tx_data = create_read_tx_buffer(length);
    spi_transfer(shared, bus, cs, &tx_data)
}

// ---------------------------------------------------------------------------
// Continuous reading
// ---------------------------------------------------------------------------

/// Minimum valid SPI sample rate in Hz.
const SPI_MIN_SAMPLE_RATE_HZ: u32 = 1;

/// Maximum valid SPI sample rate in Hz.
const SPI_MAX_SAMPLE_RATE_HZ: u32 = 10_000;

/// Maximum consecutive failures before stopping continuous reading.
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// Starts continuous reading from an SPI device on a background thread.
///
/// The thread performs a full-duplex transfer with `tx_data` on the device at
/// `(bus, cs)` at the specified `sample_rate_hz` frequency. Each successful
/// transfer is emitted as an `spi-sensor-data` Tauri event with an
/// `SpiTransferResult` payload.
///
/// If three consecutive transfers fail, the thread stops and emits an
/// `spi-continuous-stopped` event with the reason.
///
/// # Errors
///
/// Returns `SpiError` if:
/// - `sample_rate_hz` is not in [1, 10000]
/// - A continuous reader is already active for this (bus, cs) pair
/// - The shared state lock cannot be acquired
pub fn start_continuous_reading(
    shared: &SharedSpi,
    bus: u8,
    cs: u8,
    tx_data: &[u8],
    sample_rate_hz: u32,
    app_handle: tauri::AppHandle,
) -> Result<(), SpiError> {
    // Validate sample rate
    if sample_rate_hz < SPI_MIN_SAMPLE_RATE_HZ || sample_rate_hz > SPI_MAX_SAMPLE_RATE_HZ {
        return Err(SpiError {
            code: ERR_INVALID_SAMPLE_RATE.to_string(),
            message: format!(
                "Invalid sample rate {} Hz. Valid range: {} to {} Hz.",
                sample_rate_hz, SPI_MIN_SAMPLE_RATE_HZ, SPI_MAX_SAMPLE_RATE_HZ
            ),
        });
    }

    // Check if already reading for this (bus, cs) pair
    let mut state = shared.lock().map_err(|e| SpiError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire SPI state lock: {}", e),
    })?;

    let key = (bus, cs);
    if state.continuous_readers.get(&key) == Some(&true) {
        return Err(SpiError {
            code: ERR_ALREADY_READING.to_string(),
            message: format!(
                "Continuous reading already active for bus {} CS {}",
                bus, cs
            ),
        });
    }

    // Mark as active
    state.continuous_readers.insert(key, true);
    drop(state);

    // Clone data for the background thread
    let shared_clone = Arc::clone(shared);
    let tx_data = tx_data.to_vec();
    let sleep_duration = Duration::from_micros(1_000_000 / sample_rate_hz as u64);

    std::thread::spawn(move || {
        let mut consecutive_failures: u32 = 0;

        loop {
            // Check if we should stop
            {
                let state = match shared_clone.lock() {
                    Ok(s) => s,
                    Err(_) => break,
                };
                if state.continuous_readers.get(&key) != Some(&true) {
                    break;
                }
            }

            // Perform the transfer
            let transfer_result = (|| -> Result<Vec<u8>, std::io::Error> {
                let path = format!("/dev/spidev{}.{}", bus, cs);
                let mut spi = Spidev::open(&path)?;

                // Apply stored config if available
                let state = shared_clone.lock().map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
                })?;

                let mut opts = SpidevOptions::new();
                if let Some(config) = state.configs.get(&(bus, cs)) {
                    opts.max_speed_hz(config.clock_speed_hz);
                    opts.mode(spi_mode_to_mode_flags(&config.mode));
                    opts.bits_per_word(config.bits_per_word);
                    opts.lsb_first(config.bit_order == SpiBitOrder::LsbFirst);
                } else {
                    opts.max_speed_hz(1_000_000);
                    opts.mode(SpiModeFlags::SPI_MODE_0);
                    opts.bits_per_word(8);
                    opts.lsb_first(false);
                }
                drop(state);

                spi.configure(&opts.build())?;

                let mut rx_buf = vec![0u8; tx_data.len()];
                {
                    let mut transfer = SpidevTransfer::read_write(&tx_data, &mut rx_buf);
                    spi.transfer(&mut transfer)?;
                }
                Ok(rx_buf)
            })();

            match transfer_result {
                Ok(rx_data) => {
                    consecutive_failures = 0;

                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let result = SpiTransferResult {
                        tx_data: tx_data.clone(),
                        rx_data,
                        timestamp,
                    };

                    let _ = app_handle.emit("spi-sensor-data", &result);
                }
                Err(_) => {
                    consecutive_failures += 1;
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        let reason = format!(
                            "Stopped after {} consecutive transfer failures on bus {} CS {}",
                            MAX_CONSECUTIVE_FAILURES, bus, cs
                        );

                        #[derive(Serialize, Clone)]
                        struct ContinuousStoppedPayload {
                            bus: u8,
                            cs: u8,
                            reason: String,
                        }

                        let _ = app_handle.emit(
                            "spi-continuous-stopped",
                            &ContinuousStoppedPayload {
                                bus,
                                cs,
                                reason,
                            },
                        );

                        // Mark as inactive
                        if let Ok(mut state) = shared_clone.lock() {
                            state.continuous_readers.insert(key, false);
                        }
                        break;
                    }
                }
            }

            std::thread::sleep(sleep_duration);
        }
    });

    Ok(())
}

/// Stops continuous reading for the given (bus, cs) pair.
///
/// Sets the `continuous_readers` flag to `false`, which signals the background
/// thread to stop on its next iteration.
///
/// # Errors
///
/// Returns `SpiError` if the shared state lock cannot be acquired.
pub fn stop_continuous_reading(
    shared: &SharedSpi,
    bus: u8,
    cs: u8,
) -> Result<(), SpiError> {
    let mut state = shared.lock().map_err(|e| SpiError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire SPI state lock: {}", e),
    })?;

    state.continuous_readers.insert((bus, cs), false);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_spi_bus_access_nonexistent_path() {
        let (accessible, error_message) =
            check_spi_bus_access("/dev/spidev-nonexistent-test-99.0");
        assert!(!accessible);
        assert!(error_message.is_some());
    }

    #[test]
    fn test_list_spi_buses_returns_ok() {
        // On any system, list_spi_buses should return Ok (possibly empty vec)
        let result = list_spi_buses();
        assert!(result.is_ok());
    }

    #[test]
    fn test_spi_bus_info_serialization() {
        let info = SpiBusInfo {
            bus_number: 0,
            chip_select: 1,
            path: "/dev/spidev0.1".to_string(),
            accessible: true,
            error_message: None,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"bus_number\":0"));
        assert!(json.contains("\"chip_select\":1"));
        assert!(json.contains("\"/dev/spidev0.1\""));
        assert!(json.contains("\"accessible\":true"));
    }

    #[test]
    fn test_spi_bus_info_not_accessible_serialization() {
        let info = SpiBusInfo {
            bus_number: 1,
            chip_select: 0,
            path: "/dev/spidev1.0".to_string(),
            accessible: false,
            error_message: Some("Permission denied for /dev/spidev1.0.".to_string()),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"accessible\":false"));
        assert!(json.contains("Permission denied"));
    }

    #[test]
    fn test_spi_bus_info_fields() {
        let info = SpiBusInfo {
            bus_number: 2,
            chip_select: 3,
            path: "/dev/spidev2.3".to_string(),
            accessible: true,
            error_message: None,
        };
        assert_eq!(info.bus_number, 2);
        assert_eq!(info.chip_select, 3);
        assert_eq!(info.path, "/dev/spidev2.3");
        assert!(info.accessible);
        assert!(info.error_message.is_none());
    }

    #[test]
    fn test_check_spi_bus_access_error_message_contains_path() {
        let path = "/dev/spidev-fake-99.99";
        let (accessible, error_message) = check_spi_bus_access(path);
        assert!(!accessible);
        let msg = error_message.unwrap();
        assert!(msg.contains(path), "Error message should contain the device path");
    }

    #[test]
    fn test_list_spi_buses_sorted_output() {
        // list_spi_buses returns sorted results; verify the contract holds
        let result = list_spi_buses().unwrap();
        for window in result.windows(2) {
            let a = &window[0];
            let b = &window[1];
            assert!(
                (a.bus_number, a.chip_select) <= (b.bus_number, b.chip_select),
                "Buses should be sorted by (bus_number, chip_select)"
            );
        }
    }

    // -----------------------------------------------------------------------
    // spi_mode_to_flags tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_spi_mode_to_flags_mode0() {
        assert_eq!(spi_mode_to_flags(&SpiMode::Mode0), (0, 0));
    }

    #[test]
    fn test_spi_mode_to_flags_mode1() {
        assert_eq!(spi_mode_to_flags(&SpiMode::Mode1), (0, 1));
    }

    #[test]
    fn test_spi_mode_to_flags_mode2() {
        assert_eq!(spi_mode_to_flags(&SpiMode::Mode2), (1, 0));
    }

    #[test]
    fn test_spi_mode_to_flags_mode3() {
        assert_eq!(spi_mode_to_flags(&SpiMode::Mode3), (1, 1));
    }

    // -----------------------------------------------------------------------
    // configure_spi tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_configure_spi_valid_min_clock_speed() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 100_000,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let result = configure_spi(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&(0, 0)), Some(&config));
    }

    #[test]
    fn test_configure_spi_valid_max_clock_speed() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 1,
            clock_speed_hz: 50_000_000,
            mode: SpiMode::Mode3,
            bits_per_word: 8,
            bit_order: SpiBitOrder::LsbFirst,
        };
        let result = configure_spi(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&(0, 1)), Some(&config));
    }

    #[test]
    fn test_configure_spi_valid_mid_range_clock() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 1,
            chip_select: 0,
            clock_speed_hz: 1_000_000,
            mode: SpiMode::Mode1,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let result = configure_spi(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&(1, 0)), Some(&config));
    }

    #[test]
    fn test_configure_spi_invalid_clock_speed_too_low() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 99_999,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let result = configure_spi(&shared, config);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert_eq!(err.code, ERR_INVALID_CLOCK_SPEED);
        assert!(err.message.contains("99999"));
    }

    #[test]
    fn test_configure_spi_invalid_clock_speed_too_high() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 50_000_001,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let result = configure_spi(&shared, config);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert_eq!(err.code, ERR_INVALID_CLOCK_SPEED);
        assert!(err.message.contains("50000001"));
    }

    #[test]
    fn test_configure_spi_invalid_zero_clock_speed() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 0,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let result = configure_spi(&shared, config);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ERR_INVALID_CLOCK_SPEED);
    }

    #[test]
    fn test_configure_spi_overwrites_existing_config() {
        let shared = create_shared_spi();

        let config1 = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 1_000_000,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        configure_spi(&shared, config1).unwrap();

        let config2 = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 10_000_000,
            mode: SpiMode::Mode2,
            bits_per_word: 8,
            bit_order: SpiBitOrder::LsbFirst,
        };
        configure_spi(&shared, config2.clone()).unwrap();

        let state = shared.lock().unwrap();
        let stored = state.configs.get(&(0, 0)).unwrap();
        assert_eq!(stored.clock_speed_hz, 10_000_000);
        assert_eq!(stored.mode, SpiMode::Mode2);
        assert_eq!(stored.bit_order, SpiBitOrder::LsbFirst);
    }

    #[test]
    fn test_configure_spi_multiple_bus_cs_combinations() {
        let shared = create_shared_spi();

        let config_0_0 = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 1_000_000,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let config_0_1 = SpiConfig {
            bus_number: 0,
            chip_select: 1,
            clock_speed_hz: 5_000_000,
            mode: SpiMode::Mode1,
            bits_per_word: 8,
            bit_order: SpiBitOrder::LsbFirst,
        };
        let config_1_0 = SpiConfig {
            bus_number: 1,
            chip_select: 0,
            clock_speed_hz: 20_000_000,
            mode: SpiMode::Mode3,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };

        configure_spi(&shared, config_0_0.clone()).unwrap();
        configure_spi(&shared, config_0_1.clone()).unwrap();
        configure_spi(&shared, config_1_0.clone()).unwrap();

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.len(), 3);
        assert_eq!(state.configs.get(&(0, 0)), Some(&config_0_0));
        assert_eq!(state.configs.get(&(0, 1)), Some(&config_0_1));
        assert_eq!(state.configs.get(&(1, 0)), Some(&config_1_0));
    }

    #[test]
    fn test_configure_spi_invalid_speed_does_not_persist() {
        let shared = create_shared_spi();
        let config = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 50,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let _ = configure_spi(&shared, config);

        let state = shared.lock().unwrap();
        assert!(state.configs.is_empty());
    }

    #[test]
    fn test_configure_spi_all_modes_accepted() {
        let shared = create_shared_spi();
        let modes = [SpiMode::Mode0, SpiMode::Mode1, SpiMode::Mode2, SpiMode::Mode3];

        for (i, mode) in modes.iter().enumerate() {
            let config = SpiConfig {
                bus_number: 0,
                chip_select: i as u8,
                clock_speed_hz: 1_000_000,
                mode: mode.clone(),
                bits_per_word: 8,
                bit_order: SpiBitOrder::MsbFirst,
            };
            assert!(configure_spi(&shared, config).is_ok());
        }

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.len(), 4);
    }

    // -----------------------------------------------------------------------
    // SPI transfer operation tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_spi_transfer_nonexistent_bus_returns_error() {
        let shared = create_shared_spi();
        let result = spi_transfer(&shared, 99, 0, &[0x01, 0x02]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.code == ERR_BUS_NOT_FOUND
                || err.code == ERR_PERMISSION_DENIED
                || err.code == ERR_BUS_ERROR
        );
        assert!(!err.message.is_empty());
    }

    #[test]
    fn test_spi_write_nonexistent_bus_returns_error() {
        let shared = create_shared_spi();
        let result = spi_write(&shared, 99, 0, &[0xAA, 0xBB]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.code == ERR_BUS_NOT_FOUND
                || err.code == ERR_PERMISSION_DENIED
                || err.code == ERR_BUS_ERROR
        );
        assert!(!err.message.is_empty());
    }

    #[test]
    fn test_spi_read_nonexistent_bus_returns_error() {
        let shared = create_shared_spi();
        let result = spi_read(&shared, 99, 0, 4);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.code == ERR_BUS_NOT_FOUND
                || err.code == ERR_PERMISSION_DENIED
                || err.code == ERR_BUS_ERROR
        );
        assert!(!err.message.is_empty());
    }

    #[test]
    fn test_create_read_tx_buffer_all_zeros() {
        let buf = create_read_tx_buffer(10);
        assert_eq!(buf.len(), 10);
        assert!(buf.iter().all(|&b| b == 0x00));
    }

    #[test]
    fn test_create_read_tx_buffer_length_1() {
        let buf = create_read_tx_buffer(1);
        assert_eq!(buf.len(), 1);
        assert_eq!(buf[0], 0x00);
    }

    #[test]
    fn test_create_read_tx_buffer_large() {
        let buf = create_read_tx_buffer(4096);
        assert_eq!(buf.len(), 4096);
        assert!(buf.iter().all(|&b| b == 0x00));
    }

    #[test]
    fn test_create_read_tx_buffer_empty() {
        let buf = create_read_tx_buffer(0);
        assert_eq!(buf.len(), 0);
    }

    // -----------------------------------------------------------------------
    // map_io_error tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_map_io_error_not_found() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");
        let err = map_io_error(&io_err, 0, 1);
        assert_eq!(err.code, ERR_BUS_NOT_FOUND);
        assert!(err.message.contains("0.1"));
    }

    #[test]
    fn test_map_io_error_permission_denied() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let err = map_io_error(&io_err, 0, 0);
        assert_eq!(err.code, ERR_PERMISSION_DENIED);
        assert!(err.message.contains("/dev/spidev0.0"));
    }

    #[test]
    fn test_map_io_error_generic_bus_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "something went wrong");
        let err = map_io_error(&io_err, 1, 2);
        assert_eq!(err.code, ERR_BUS_ERROR);
        assert!(err.message.contains("1.2"));
    }

    #[test]
    fn test_configure_spi_both_bit_orders_accepted() {
        let shared = create_shared_spi();

        let config_msb = SpiConfig {
            bus_number: 0,
            chip_select: 0,
            clock_speed_hz: 1_000_000,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::MsbFirst,
        };
        let config_lsb = SpiConfig {
            bus_number: 0,
            chip_select: 1,
            clock_speed_hz: 1_000_000,
            mode: SpiMode::Mode0,
            bits_per_word: 8,
            bit_order: SpiBitOrder::LsbFirst,
        };

        assert!(configure_spi(&shared, config_msb).is_ok());
        assert!(configure_spi(&shared, config_lsb).is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&(0, 0)).unwrap().bit_order, SpiBitOrder::MsbFirst);
        assert_eq!(state.configs.get(&(0, 1)).unwrap().bit_order, SpiBitOrder::LsbFirst);
    }

    // -----------------------------------------------------------------------
    // start_continuous_reading / stop_continuous_reading tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_stop_continuous_reading_sets_flag_false() {
        let shared = create_shared_spi();

        // Pre-set the flag to true
        {
            let mut state = shared.lock().unwrap();
            state.continuous_readers.insert((0, 0), true);
        }

        let result = stop_continuous_reading(&shared, 0, 0);
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(0, 0)), Some(&false));
    }

    #[test]
    fn test_stop_continuous_reading_nonexistent_key_inserts_false() {
        let shared = create_shared_spi();

        let result = stop_continuous_reading(&shared, 1, 1);
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(1, 1)), Some(&false));
    }

    #[test]
    fn test_stop_continuous_reading_multiple_keys() {
        let shared = create_shared_spi();

        // Set up multiple active readers
        {
            let mut state = shared.lock().unwrap();
            state.continuous_readers.insert((0, 0), true);
            state.continuous_readers.insert((0, 1), true);
        }

        // Stop only one
        stop_continuous_reading(&shared, 0, 0).unwrap();

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(0, 0)), Some(&false));
        assert_eq!(state.continuous_readers.get(&(0, 1)), Some(&true));
    }

    #[test]
    fn test_continuous_reading_constants() {
        assert_eq!(MAX_CONSECUTIVE_FAILURES, 3);
        assert_eq!(SPI_MIN_SAMPLE_RATE_HZ, 1);
        assert_eq!(SPI_MAX_SAMPLE_RATE_HZ, 10_000);
    }
}
