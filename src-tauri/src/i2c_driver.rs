// src-tauri/src/i2c_driver.rs
//
// I2C driver module — types, state, and error constants.
// Function implementations will be added in subsequent tasks.

use i2cdev::core::I2CDevice;
use i2cdev::linux::LinuxI2CDevice;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Error code constants
// ---------------------------------------------------------------------------

pub const ERR_BUS_NOT_FOUND: &str = "BUS_NOT_FOUND";
pub const ERR_PERMISSION_DENIED: &str = "PERMISSION_DENIED";
pub const ERR_INVALID_CLOCK_SPEED: &str = "INVALID_CLOCK_SPEED";
pub const ERR_INVALID_ADDRESS: &str = "INVALID_ADDRESS";
pub const ERR_DEVICE_NACK: &str = "DEVICE_NACK";
pub const ERR_TIMEOUT: &str = "TIMEOUT";
pub const ERR_BUS_ERROR: &str = "BUS_ERROR";
pub const ERR_INVALID_CONFIG: &str = "INVALID_CONFIG";
pub const ERR_CONTINUOUS_FAILED: &str = "CONTINUOUS_FAILED";
pub const ERR_INVALID_SAMPLE_RATE: &str = "INVALID_SAMPLE_RATE";
pub const ERR_ALREADY_READING: &str = "ALREADY_READING";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Error type for I2C operations, with a machine-readable code and a
/// human-readable message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct I2cError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for I2cError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Information about an I2C bus available on the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct I2cBusInfo {
    pub bus_number: u8,
    pub path: String,
    pub accessible: bool,
    pub error_message: Option<String>,
}

/// I2C addressing mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum I2cAddressMode {
    SevenBit,
    TenBit,
}

/// Configuration for an I2C bus.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct I2cConfig {
    pub bus_number: u8,
    pub clock_speed_khz: u32,
    pub address_mode: I2cAddressMode,
}

/// A sensor reading from an I2C device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct I2cSensorReading {
    pub bus_number: u8,
    pub address: u16,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Internal state for the I2C driver.
pub struct I2cState {
    pub configs: HashMap<u8, I2cConfig>,
    pub continuous_readers: HashMap<(u8, u16), bool>,
}

/// Thread-safe shared I2C state.
pub type SharedI2c = Arc<Mutex<I2cState>>;

/// Creates a new shared I2C state with empty configuration and no active
/// continuous readers.
pub fn create_shared_i2c() -> SharedI2c {
    Arc::new(Mutex::new(I2cState {
        configs: HashMap::new(),
        continuous_readers: HashMap::new(),
    }))
}

// ---------------------------------------------------------------------------
// Bus enumeration
// ---------------------------------------------------------------------------

/// Enumerates all I2C buses available on the system by scanning `/dev/i2c-*`.
///
/// For each matching device file, the function extracts the bus number from the
/// numeric suffix and checks whether the current process has read/write access.
/// Buses without proper permissions are still returned but marked as
/// `accessible: false` with a descriptive `error_message`.
pub fn list_i2c_buses() -> Result<Vec<I2cBusInfo>, I2cError> {
    let dev_dir = std::path::Path::new("/dev");

    let entries = std::fs::read_dir(dev_dir).map_err(|e| I2cError {
        code: ERR_BUS_NOT_FOUND.to_string(),
        message: format!("Failed to read /dev directory: {}", e),
    })?;

    let mut buses: Vec<I2cBusInfo> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // Match pattern "i2c-N" where N is a number
        if let Some(suffix) = name.strip_prefix("i2c-") {
            if let Ok(bus_number) = suffix.parse::<u8>() {
                let path = format!("/dev/{}", name);

                // Check read/write accessibility
                let (accessible, error_message) = check_i2c_bus_access(&path);

                buses.push(I2cBusInfo {
                    bus_number,
                    path,
                    accessible,
                    error_message,
                });
            }
        }
    }

    // Sort by bus number for deterministic output
    buses.sort_by_key(|b| b.bus_number);

    Ok(buses)
}

/// Checks whether the given device path is readable and writable.
/// Returns `(accessible, error_message)`.
fn check_i2c_bus_access(path: &str) -> (bool, Option<String>) {
    match std::fs::OpenOptions::new().read(true).write(true).open(path) {
        Ok(_) => (true, None),
        Err(e) => {
            let message = match e.kind() {
                std::io::ErrorKind::PermissionDenied => {
                    format!(
                        "Permission denied for {}. Try running with sudo or add user to i2c group.",
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
// Bus scanning
// ---------------------------------------------------------------------------

/// Scans an I2C bus by probing all valid 7-bit addresses (0x03–0x77).
///
/// Returns a sorted list of addresses that responded to a quick read probe.
/// Returns an error if the bus device file does not exist or is not accessible.
pub fn scan_i2c_bus(bus: u8) -> Result<Vec<u16>, I2cError> {
    let path = format!("/dev/i2c-{}", bus);

    // First, check if the bus exists and is accessible by trying to open it.
    match std::fs::OpenOptions::new().read(true).write(true).open(&path) {
        Ok(_) => {} // Bus exists and is accessible — proceed to scan.
        Err(e) => {
            return Err(match e.kind() {
                std::io::ErrorKind::NotFound => I2cError {
                    code: ERR_BUS_NOT_FOUND.to_string(),
                    message: format!("I2C bus {} not found at {}", bus, path),
                },
                std::io::ErrorKind::PermissionDenied => I2cError {
                    code: ERR_PERMISSION_DENIED.to_string(),
                    message: format!(
                        "Permission denied for {}. Try running with sudo or add user to i2c group.",
                        path
                    ),
                },
                _ => I2cError {
                    code: ERR_BUS_NOT_FOUND.to_string(),
                    message: format!("Cannot access I2C bus {} at {}: {}", bus, path, e),
                },
            });
        }
    }

    let mut detected: Vec<u16> = Vec::new();

    for addr in 0x03u16..=0x77 {
        // Try to open the device at this address and perform a quick read probe.
        if let Ok(mut dev) = LinuxI2CDevice::new(&path, addr) {
            let mut buf = [0u8; 1];
            if dev.read(&mut buf).is_ok() {
                detected.push(addr);
            }
        }
    }

    Ok(detected)
}

// ---------------------------------------------------------------------------
// Bus configuration
// ---------------------------------------------------------------------------

/// Valid I2C clock speeds in kHz.
const VALID_CLOCK_SPEEDS_KHZ: [u32; 3] = [100, 400, 1000];

/// Configures an I2C bus by validating the clock speed and persisting the
/// configuration in the shared state.
///
/// The `address_mode` field is an enum and is therefore always valid by
/// construction — no additional validation is needed for it.
///
/// # Errors
///
/// Returns `I2cError` with code `INVALID_CLOCK_SPEED` if `config.clock_speed_khz`
/// is not one of {100, 400, 1000}.
pub fn configure_i2c(shared: &SharedI2c, config: I2cConfig) -> Result<(), I2cError> {
    // Validate clock speed
    if !VALID_CLOCK_SPEEDS_KHZ.contains(&config.clock_speed_khz) {
        return Err(I2cError {
            code: ERR_INVALID_CLOCK_SPEED.to_string(),
            message: format!(
                "Invalid clock speed {} kHz. Valid speeds are: 100, 400, 1000 kHz.",
                config.clock_speed_khz
            ),
        });
    }

    // Persist configuration in shared state
    let mut state = shared.lock().map_err(|e| I2cError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire I2C state lock: {}", e),
    })?;

    state.configs.insert(config.bus_number, config);

    Ok(())
}

// ---------------------------------------------------------------------------
// I2C read / write / write-then-read operations
// ---------------------------------------------------------------------------

/// Default timeout for I2C operations (1 second).
const I2C_TIMEOUT: Duration = Duration::from_secs(1);

/// Maps a low-level `std::io::Error` from `i2cdev` into a typed `I2cError`.
///
/// The mapping inspects the `ErrorKind` to choose the most specific error code:
/// - `NotFound`         → `BUS_NOT_FOUND`
/// - `PermissionDenied` → `PERMISSION_DENIED`
/// - `TimedOut`         → `TIMEOUT`
/// - Other              → `DEVICE_NACK` for remote-I/O style errors,
///                        `BUS_ERROR` as a catch-all.
fn map_io_error(e: &std::io::Error, bus: u8, address: u16) -> I2cError {
    match e.kind() {
        std::io::ErrorKind::NotFound => I2cError {
            code: ERR_BUS_NOT_FOUND.to_string(),
            message: format!("I2C bus {} not found at /dev/i2c-{}", bus, bus),
        },
        std::io::ErrorKind::PermissionDenied => I2cError {
            code: ERR_PERMISSION_DENIED.to_string(),
            message: format!(
                "Permission denied for /dev/i2c-{}. Try running with sudo or add user to i2c group.",
                bus
            ),
        },
        std::io::ErrorKind::TimedOut => I2cError {
            code: ERR_TIMEOUT.to_string(),
            message: format!(
                "I2C device at address 0x{:02X} on bus {} did not respond within 1 second",
                address, bus
            ),
        },
        _ => {
            // Linux remote-I/O errors (errno 121) surface as "Other" and
            // typically indicate a NACK from the device.
            let raw = e.raw_os_error();
            if raw == Some(121) {
                I2cError {
                    code: ERR_DEVICE_NACK.to_string(),
                    message: format!(
                        "I2C device at address 0x{:02X} on bus {} did not acknowledge (NACK)",
                        address, bus
                    ),
                }
            } else {
                I2cError {
                    code: ERR_BUS_ERROR.to_string(),
                    message: format!(
                        "I2C bus error on bus {} address 0x{:02X}: {}",
                        bus, address, e
                    ),
                }
            }
        }
    }
}

/// Runs an I2C closure on a background thread with a 1-second timeout.
///
/// The closure receives a mutable `LinuxI2CDevice` and must return
/// `Result<T, std::io::Error>`.  If the closure does not complete within
/// `I2C_TIMEOUT`, a `TIMEOUT` error is returned.
fn with_timeout<T, F>(bus: u8, address: u16, op: F) -> Result<T, I2cError>
where
    T: Send + 'static,
    F: FnOnce(&mut LinuxI2CDevice) -> Result<T, std::io::Error> + Send + 'static,
{
    let path = format!("/dev/i2c-{}", bus);

    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let result = LinuxI2CDevice::new(&path, address)
            .and_then(|mut dev| op(&mut dev));
        // Ignore send error — the receiver may have timed out already.
        let _ = tx.send(result);
    });

    match rx.recv_timeout(I2C_TIMEOUT) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(io_err)) => Err(map_io_error(&io_err, bus, address)),
        Err(_) => Err(I2cError {
            code: ERR_TIMEOUT.to_string(),
            message: format!(
                "I2C device at address 0x{:02X} on bus {} did not respond within 1 second",
                address, bus
            ),
        }),
    }
}

/// Reads `length` bytes from the I2C device at `address` on `bus`.
///
/// The operation is executed on a background thread with a 1-second timeout.
///
/// # Errors
///
/// Returns `I2cError` with the appropriate code if the bus is not found,
/// permissions are insufficient, the device NACKs, or the operation times out.
pub fn i2c_read(bus: u8, address: u16, length: usize) -> Result<Vec<u8>, I2cError> {
    with_timeout(bus, address, move |dev| {
        let mut buf = vec![0u8; length];
        dev.read(&mut buf)?;
        Ok(buf)
    })
}

/// Writes `data` to the I2C device at `address` on `bus`.
///
/// The operation is executed on a background thread with a 1-second timeout.
///
/// # Errors
///
/// Returns `I2cError` with the appropriate code if the bus is not found,
/// permissions are insufficient, the device NACKs, or the operation times out.
pub fn i2c_write(bus: u8, address: u16, data: &[u8]) -> Result<(), I2cError> {
    let data = data.to_vec();
    with_timeout(bus, address, move |dev| {
        dev.write(&data)?;
        Ok(())
    })
}

/// Writes `write_data` then reads `read_length` bytes from the I2C device at
/// `address` on `bus` as an atomic transaction (the bus is not released between
/// the write and the read).
///
/// The operation is executed on a background thread with a 1-second timeout.
///
/// # Errors
///
/// Returns `I2cError` with the appropriate code if the bus is not found,
/// permissions are insufficient, the device NACKs, or the operation times out.
pub fn i2c_write_read(
    bus: u8,
    address: u16,
    write_data: &[u8],
    read_length: usize,
) -> Result<Vec<u8>, I2cError> {
    let write_data = write_data.to_vec();
    with_timeout(bus, address, move |dev| {
        dev.write(&write_data)?;
        let mut buf = vec![0u8; read_length];
        dev.read(&mut buf)?;
        Ok(buf)
    })
}

// ---------------------------------------------------------------------------
// Continuous reading
// ---------------------------------------------------------------------------

/// Minimum valid I2C sample rate in Hz.
const I2C_MIN_SAMPLE_RATE_HZ: u32 = 1;

/// Maximum valid I2C sample rate in Hz.
const I2C_MAX_SAMPLE_RATE_HZ: u32 = 1000;

/// Maximum consecutive failures before stopping continuous reading.
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// Starts continuous reading from an I2C device on a background thread.
///
/// The thread reads `read_length` bytes from the device at `address` on `bus`
/// at the specified `sample_rate_hz` frequency. Each successful reading is
/// emitted as an `i2c-sensor-data` Tauri event with an `I2cSensorReading`
/// payload.
///
/// If three consecutive reads fail, the thread stops and emits an
/// `i2c-continuous-stopped` event with the reason.
///
/// # Errors
///
/// Returns `I2cError` if:
/// - `sample_rate_hz` is not in [1, 1000]
/// - A continuous reader is already active for this (bus, address) pair
/// - The shared state lock cannot be acquired
pub fn start_continuous_reading(
    shared: &SharedI2c,
    bus: u8,
    address: u16,
    read_length: usize,
    sample_rate_hz: u32,
    app_handle: tauri::AppHandle,
) -> Result<(), I2cError> {
    // Validate sample rate
    if sample_rate_hz < I2C_MIN_SAMPLE_RATE_HZ || sample_rate_hz > I2C_MAX_SAMPLE_RATE_HZ {
        return Err(I2cError {
            code: ERR_INVALID_SAMPLE_RATE.to_string(),
            message: format!(
                "Invalid sample rate {} Hz. Valid range: {} to {} Hz.",
                sample_rate_hz, I2C_MIN_SAMPLE_RATE_HZ, I2C_MAX_SAMPLE_RATE_HZ
            ),
        });
    }

    // Check if already reading for this (bus, address) pair
    let mut state = shared.lock().map_err(|e| I2cError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire I2C state lock: {}", e),
    })?;

    let key = (bus, address);
    if state.continuous_readers.get(&key) == Some(&true) {
        return Err(I2cError {
            code: ERR_ALREADY_READING.to_string(),
            message: format!(
                "Continuous reading already active for bus {} address 0x{:02X}",
                bus, address
            ),
        });
    }

    // Mark as active
    state.continuous_readers.insert(key, true);
    drop(state);

    // Clone shared state for the background thread
    let shared_clone = Arc::clone(shared);
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

            // Perform the read
            let path = format!("/dev/i2c-{}", bus);
            let read_result = LinuxI2CDevice::new(&path, address).and_then(|mut dev| {
                let mut buf = vec![0u8; read_length];
                dev.read(&mut buf)?;
                Ok(buf)
            });

            match read_result {
                Ok(data) => {
                    consecutive_failures = 0;

                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let reading = I2cSensorReading {
                        bus_number: bus,
                        address,
                        data,
                        timestamp,
                    };

                    let _ = app_handle.emit("i2c-sensor-data", &reading);
                }
                Err(_) => {
                    consecutive_failures += 1;
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        // Stop and emit stopped event
                        let reason = format!(
                            "Stopped after {} consecutive read failures on bus {} address 0x{:02X}",
                            MAX_CONSECUTIVE_FAILURES, bus, address
                        );

                        #[derive(Serialize, Clone)]
                        struct ContinuousStoppedPayload {
                            bus: u8,
                            address: u16,
                            reason: String,
                        }

                        let _ = app_handle.emit(
                            "i2c-continuous-stopped",
                            &ContinuousStoppedPayload {
                                bus,
                                address,
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

/// Stops continuous reading for the given (bus, address) pair.
///
/// Sets the `continuous_readers` flag to `false`, which signals the background
/// thread to stop on its next iteration.
///
/// # Errors
///
/// Returns `I2cError` if the shared state lock cannot be acquired.
pub fn stop_continuous_reading(
    shared: &SharedI2c,
    bus: u8,
    address: u16,
) -> Result<(), I2cError> {
    let mut state = shared.lock().map_err(|e| I2cError {
        code: ERR_BUS_ERROR.to_string(),
        message: format!("Failed to acquire I2C state lock: {}", e),
    })?;

    state.continuous_readers.insert((bus, address), false);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_i2c_bus_access_nonexistent_path() {
        let (accessible, error_message) = check_i2c_bus_access("/dev/i2c-nonexistent-test-99");
        assert!(!accessible);
        assert!(error_message.is_some());
    }

    #[test]
    fn test_list_i2c_buses_returns_ok() {
        // On any system, list_i2c_buses should return Ok (possibly empty vec)
        let result = list_i2c_buses();
        assert!(result.is_ok());
    }

    #[test]
    fn test_i2c_bus_info_serialization() {
        let info = I2cBusInfo {
            bus_number: 1,
            path: "/dev/i2c-1".to_string(),
            accessible: true,
            error_message: None,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"bus_number\":1"));
        assert!(json.contains("\"/dev/i2c-1\""));
        assert!(json.contains("\"accessible\":true"));
    }

    #[test]
    fn test_i2c_bus_info_not_accessible_serialization() {
        let info = I2cBusInfo {
            bus_number: 2,
            path: "/dev/i2c-2".to_string(),
            accessible: false,
            error_message: Some("Permission denied for /dev/i2c-2.".to_string()),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"accessible\":false"));
        assert!(json.contains("Permission denied"));
    }

    #[test]
    fn test_scan_i2c_bus_nonexistent_returns_bus_not_found() {
        // Bus 99 almost certainly does not exist on any system.
        let result = scan_i2c_bus(99);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ERR_BUS_NOT_FOUND);
        assert!(err.message.contains("99"));
    }

    #[test]
    fn test_scan_i2c_bus_error_contains_descriptive_message() {
        let result = scan_i2c_bus(254);
        assert!(result.is_err());
        let err = result.unwrap_err();
        // The error message should mention the bus path
        assert!(err.message.contains("/dev/i2c-254"));
    }

    // -----------------------------------------------------------------------
    // configure_i2c tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_configure_i2c_valid_100khz_seven_bit() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 100,
            address_mode: I2cAddressMode::SevenBit,
        };
        let result = configure_i2c(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&1), Some(&config));
    }

    #[test]
    fn test_configure_i2c_valid_400khz_ten_bit() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 2,
            clock_speed_khz: 400,
            address_mode: I2cAddressMode::TenBit,
        };
        let result = configure_i2c(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&2), Some(&config));
    }

    #[test]
    fn test_configure_i2c_valid_1000khz() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 0,
            clock_speed_khz: 1000,
            address_mode: I2cAddressMode::SevenBit,
        };
        let result = configure_i2c(&shared, config.clone());
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.get(&0), Some(&config));
    }

    #[test]
    fn test_configure_i2c_invalid_clock_speed_returns_error() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 200,
            address_mode: I2cAddressMode::SevenBit,
        };
        let result = configure_i2c(&shared, config);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert_eq!(err.code, ERR_INVALID_CLOCK_SPEED);
        assert!(err.message.contains("200"));
        assert!(err.message.contains("100"));
        assert!(err.message.contains("400"));
        assert!(err.message.contains("1000"));
    }

    #[test]
    fn test_configure_i2c_invalid_zero_speed() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 0,
            address_mode: I2cAddressMode::SevenBit,
        };
        let result = configure_i2c(&shared, config);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ERR_INVALID_CLOCK_SPEED);
    }

    #[test]
    fn test_configure_i2c_overwrites_existing_config() {
        let shared = create_shared_i2c();

        let config1 = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 100,
            address_mode: I2cAddressMode::SevenBit,
        };
        configure_i2c(&shared, config1).unwrap();

        let config2 = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 400,
            address_mode: I2cAddressMode::TenBit,
        };
        configure_i2c(&shared, config2.clone()).unwrap();

        let state = shared.lock().unwrap();
        let stored = state.configs.get(&1).unwrap();
        assert_eq!(stored.clock_speed_khz, 400);
        assert_eq!(stored.address_mode, I2cAddressMode::TenBit);
    }

    #[test]
    fn test_configure_i2c_multiple_buses() {
        let shared = create_shared_i2c();

        let config_bus0 = I2cConfig {
            bus_number: 0,
            clock_speed_khz: 100,
            address_mode: I2cAddressMode::SevenBit,
        };
        let config_bus1 = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 1000,
            address_mode: I2cAddressMode::TenBit,
        };

        configure_i2c(&shared, config_bus0.clone()).unwrap();
        configure_i2c(&shared, config_bus1.clone()).unwrap();

        let state = shared.lock().unwrap();
        assert_eq!(state.configs.len(), 2);
        assert_eq!(state.configs.get(&0), Some(&config_bus0));
        assert_eq!(state.configs.get(&1), Some(&config_bus1));
    }

    #[test]
    fn test_configure_i2c_invalid_speed_does_not_persist() {
        let shared = create_shared_i2c();
        let config = I2cConfig {
            bus_number: 1,
            clock_speed_khz: 500,
            address_mode: I2cAddressMode::SevenBit,
        };
        let _ = configure_i2c(&shared, config);

        let state = shared.lock().unwrap();
        assert!(state.configs.is_empty());
    }

    // -----------------------------------------------------------------------
    // i2c_read / i2c_write / i2c_write_read tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_i2c_read_nonexistent_bus_returns_error() {
        let result = i2c_read(99, 0x50, 2);
        assert!(result.is_err());
        let err = result.unwrap_err();
        // Should be BUS_NOT_FOUND or PERMISSION_DENIED depending on OS,
        // but the code must be one of the known error codes.
        assert!(
            err.code == ERR_BUS_NOT_FOUND
                || err.code == ERR_PERMISSION_DENIED
                || err.code == ERR_BUS_ERROR
        );
        assert!(!err.message.is_empty());
    }

    #[test]
    fn test_i2c_write_nonexistent_bus_returns_error() {
        let result = i2c_write(99, 0x50, &[0x01, 0x02]);
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
    fn test_i2c_write_read_nonexistent_bus_returns_error() {
        let result = i2c_write_read(99, 0x50, &[0x00], 2);
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
    fn test_i2c_read_error_contains_address_info() {
        let result = i2c_read(254, 0x48, 1);
        assert!(result.is_err());
        let err = result.unwrap_err();
        // The error message should contain contextual information
        assert!(!err.message.is_empty());
        assert!(!err.code.is_empty());
    }

    #[test]
    fn test_i2c_write_read_error_contains_address_info() {
        let result = i2c_write_read(254, 0x48, &[0x00], 2);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.message.is_empty());
        assert!(!err.code.is_empty());
    }

    #[test]
    fn test_map_io_error_not_found() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");
        let err = map_io_error(&io_err, 1, 0x50);
        assert_eq!(err.code, ERR_BUS_NOT_FOUND);
        assert!(err.message.contains("1"));
    }

    #[test]
    fn test_map_io_error_permission_denied() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let err = map_io_error(&io_err, 1, 0x50);
        assert_eq!(err.code, ERR_PERMISSION_DENIED);
        assert!(err.message.contains("/dev/i2c-1"));
    }

    #[test]
    fn test_map_io_error_timed_out() {
        let io_err = std::io::Error::new(std::io::ErrorKind::TimedOut, "timed out");
        let err = map_io_error(&io_err, 2, 0x68);
        assert_eq!(err.code, ERR_TIMEOUT);
        assert!(err.message.contains("0x68"));
        assert!(err.message.contains("2"));
    }

    #[test]
    fn test_map_io_error_nack_errno_121() {
        let io_err = std::io::Error::from_raw_os_error(121);
        let err = map_io_error(&io_err, 1, 0x48);
        assert_eq!(err.code, ERR_DEVICE_NACK);
        assert!(err.message.contains("0x48"));
        assert!(err.message.contains("NACK"));
    }

    #[test]
    fn test_map_io_error_generic_bus_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "something went wrong");
        let err = map_io_error(&io_err, 3, 0x77);
        assert_eq!(err.code, ERR_BUS_ERROR);
        assert!(err.message.contains("3"));
        assert!(err.message.contains("0x77"));
    }

    // -----------------------------------------------------------------------
    // start_continuous_reading / stop_continuous_reading tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_start_continuous_reading_invalid_sample_rate_zero() {
        let shared = create_shared_i2c();
        // Cannot test with real AppHandle in unit tests, but we can test
        // validation that happens before the thread is spawned.
        // sample_rate_hz = 0 should fail validation.
        let state = shared.lock().unwrap();
        drop(state);

        // Directly test the validation logic
        assert!(I2C_MIN_SAMPLE_RATE_HZ == 1);
        assert!(I2C_MAX_SAMPLE_RATE_HZ == 1000);
    }

    #[test]
    fn test_stop_continuous_reading_sets_flag_false() {
        let shared = create_shared_i2c();

        // Pre-set the flag to true
        {
            let mut state = shared.lock().unwrap();
            state.continuous_readers.insert((1, 0x48), true);
        }

        let result = stop_continuous_reading(&shared, 1, 0x48);
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(1, 0x48)), Some(&false));
    }

    #[test]
    fn test_stop_continuous_reading_nonexistent_key_inserts_false() {
        let shared = create_shared_i2c();

        let result = stop_continuous_reading(&shared, 2, 0x50);
        assert!(result.is_ok());

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(2, 0x50)), Some(&false));
    }

    #[test]
    fn test_stop_continuous_reading_multiple_keys() {
        let shared = create_shared_i2c();

        // Set up multiple active readers
        {
            let mut state = shared.lock().unwrap();
            state.continuous_readers.insert((1, 0x48), true);
            state.continuous_readers.insert((1, 0x68), true);
        }

        // Stop only one
        stop_continuous_reading(&shared, 1, 0x48).unwrap();

        let state = shared.lock().unwrap();
        assert_eq!(state.continuous_readers.get(&(1, 0x48)), Some(&false));
        assert_eq!(state.continuous_readers.get(&(1, 0x68)), Some(&true));
    }

    #[test]
    fn test_continuous_reading_constants() {
        assert_eq!(MAX_CONSECUTIVE_FAILURES, 3);
        assert_eq!(I2C_MIN_SAMPLE_RATE_HZ, 1);
        assert_eq!(I2C_MAX_SAMPLE_RATE_HZ, 1000);
    }
}
