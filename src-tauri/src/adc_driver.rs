use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::serial_port::{self, SharedPort};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Custom error type for ADC operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdcError {
    pub message: String,
}

impl std::fmt::Display for AdcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<serial_port::SerialPortError> for AdcError {
    fn from(err: serial_port::SerialPortError) -> Self {
        AdcError {
            message: format!("Serial error: {}", err),
        }
    }
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A single ADC reading from a specific channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdcReading {
    /// Channel identifier (0-based).
    pub channel: u8,
    /// Raw integer value from the ADC converter.
    pub raw_value: u32,
    /// Converted voltage value.
    pub voltage: f64,
    /// Timestamp in milliseconds since UNIX epoch.
    pub timestamp: u64,
}

/// Configuration parameters for the ADC driver.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdcConfig {
    /// Sample rate in Hz (valid range: 1–10_000).
    pub sample_rate_hz: u32,
    /// List of active channel IDs to read from.
    pub channels: Vec<u8>,
    /// ADC resolution in bits (e.g. 10, 12, 16).
    pub resolution_bits: u8,
    /// Reference voltage used for raw-to-voltage conversion.
    pub reference_voltage: f64,
}

impl Default for AdcConfig {
    fn default() -> Self {
        Self {
            sample_rate_hz: 100,
            channels: vec![0],
            resolution_bits: 12,
            reference_voltage: 3.3,
        }
    }
}

/// Internal state for the ADC driver.
struct AdcState {
    /// Current configuration.
    config: AdcConfig,
    /// Whether continuous reading is active.
    continuous_active: bool,
    /// Shared serial port used for communication with the ADC module.
    port: SharedPort,
}

/// Thread-safe shared ADC state.
pub type SharedAdc = Arc<Mutex<AdcState>>;

// ---------------------------------------------------------------------------
// ADC binary protocol helpers
// ---------------------------------------------------------------------------
//
// The external ADC module communicates over serial using a simple binary
// protocol.  Each *reading frame* sent by the module has the following layout:
//
//   [1 byte: channel] [4 bytes: raw_value (big-endian u32)]
//
// The driver converts the raw value to voltage using:
//   voltage = (raw_value / max_raw) * reference_voltage
// where max_raw = 2^resolution_bits - 1.

/// Expected size of a single ADC reading frame coming from the serial port.
const ADC_FRAME_SIZE: usize = 5;

/// Request byte sent to the ADC module to trigger a single-channel read.
const ADC_CMD_READ_SINGLE: u8 = 0xA1;

/// Request byte sent to start continuous reading mode.
const ADC_CMD_START_CONTINUOUS: u8 = 0xA2;

/// Request byte sent to stop continuous reading mode.
const ADC_CMD_STOP_CONTINUOUS: u8 = 0xA3;

/// Request byte sent to configure the ADC module.
const ADC_CMD_CONFIGURE: u8 = 0xA0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Creates a new shared ADC state backed by the given serial port.
pub fn create_shared_adc(port: SharedPort) -> SharedAdc {
    Arc::new(Mutex::new(AdcState {
        config: AdcConfig::default(),
        continuous_active: false,
        port,
    }))
}

/// Sends a configuration packet to the ADC module over serial.
///
/// The configuration frame layout:
///   [0xA0] [4 bytes: sample_rate_hz BE] [1 byte: num_channels]
///   [N bytes: channel IDs] [1 byte: resolution_bits]
///
/// Validates that `sample_rate_hz` is within [1, 10_000].
/// Satisfies Requirement 5.2 (configurable sample rate).
pub fn configure_adc(shared: &SharedAdc, config: AdcConfig) -> Result<(), AdcError> {
    // Validate sample rate range (Requirement 5.2).
    if config.sample_rate_hz < 1 || config.sample_rate_hz > 10_000 {
        return Err(AdcError {
            message: format!(
                "Sample rate {} Hz is out of valid range [1, 10000]",
                config.sample_rate_hz
            ),
        });
    }

    if config.channels.is_empty() {
        return Err(AdcError {
            message: "At least one channel must be specified".to_string(),
        });
    }

    if config.resolution_bits == 0 || config.resolution_bits > 32 {
        return Err(AdcError {
            message: format!(
                "Resolution {} bits is out of valid range [1, 32]",
                config.resolution_bits
            ),
        });
    }

    // Build the configuration frame.
    let num_channels = config.channels.len() as u8;
    let mut frame = Vec::with_capacity(7 + config.channels.len());
    frame.push(ADC_CMD_CONFIGURE);
    frame.extend_from_slice(&config.sample_rate_hz.to_be_bytes());
    frame.push(num_channels);
    frame.extend_from_slice(&config.channels);
    frame.push(config.resolution_bits);

    let mut state = shared.lock().map_err(|e| AdcError {
        message: format!("Failed to acquire ADC lock: {}", e),
    })?;

    serial_port::write_to_port(&state.port, &frame)?;
    state.config = config;
    Ok(())
}

/// Reads a single sample from the specified ADC channel.
///
/// Sends a read-single command to the ADC module and waits for the response
/// frame.  Returns an `AdcReading` with the raw value converted to voltage.
/// Satisfies Requirement 5.1 (read analog signals).
pub fn read_adc_channel(shared: &SharedAdc, channel: u8) -> Result<AdcReading, AdcError> {
    let state = shared.lock().map_err(|e| AdcError {
        message: format!("Failed to acquire ADC lock: {}", e),
    })?;

    // Send single-read command: [0xA1] [channel]
    let cmd = [ADC_CMD_READ_SINGLE, channel];
    serial_port::write_to_port(&state.port, &cmd)?;

    // Read the response frame from the serial port.
    let data = serial_port::read_from_port(&state.port)?;

    if data.len() < ADC_FRAME_SIZE {
        return Err(AdcError {
            message: format!(
                "Incomplete ADC frame: expected {} bytes, got {}",
                ADC_FRAME_SIZE,
                data.len()
            ),
        });
    }

    parse_adc_frame(&data[..ADC_FRAME_SIZE], &state.config)
}

/// Starts continuous reading on the given channel at the specified sample rate.
///
/// Sends a start-continuous command to the ADC module.  The module will then
/// stream reading frames over serial at the requested rate.  Use
/// `read_from_port` to consume incoming frames and `parse_adc_frame` to
/// decode them.
/// Satisfies Requirements 5.1, 5.2.
pub fn start_continuous_reading(
    shared: &SharedAdc,
    channel: u8,
    sample_rate_hz: u32,
) -> Result<(), AdcError> {
    if sample_rate_hz < 1 || sample_rate_hz > 10_000 {
        return Err(AdcError {
            message: format!(
                "Sample rate {} Hz is out of valid range [1, 10000]",
                sample_rate_hz
            ),
        });
    }

    let mut state = shared.lock().map_err(|e| AdcError {
        message: format!("Failed to acquire ADC lock: {}", e),
    })?;

    // Build command: [0xA2] [channel] [4 bytes: sample_rate BE]
    let mut cmd = Vec::with_capacity(6);
    cmd.push(ADC_CMD_START_CONTINUOUS);
    cmd.push(channel);
    cmd.extend_from_slice(&sample_rate_hz.to_be_bytes());

    serial_port::write_to_port(&state.port, &cmd)?;
    state.continuous_active = true;
    Ok(())
}

/// Stops continuous reading mode.
///
/// Sends a stop command to the ADC module so it ceases streaming frames.
pub fn stop_continuous_reading(shared: &SharedAdc) -> Result<(), AdcError> {
    let mut state = shared.lock().map_err(|e| AdcError {
        message: format!("Failed to acquire ADC lock: {}", e),
    })?;

    if !state.continuous_active {
        return Err(AdcError {
            message: "Continuous reading is not active".to_string(),
        });
    }

    let cmd = [ADC_CMD_STOP_CONTINUOUS];
    serial_port::write_to_port(&state.port, &cmd)?;
    state.continuous_active = false;
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parses a 5-byte ADC frame into an `AdcReading`.
///
/// Frame layout: [1 byte: channel] [4 bytes: raw_value big-endian u32]
pub fn parse_adc_frame(frame: &[u8], config: &AdcConfig) -> Result<AdcReading, AdcError> {
    if frame.len() < ADC_FRAME_SIZE {
        return Err(AdcError {
            message: format!(
                "ADC frame too short: expected {} bytes, got {}",
                ADC_FRAME_SIZE,
                frame.len()
            ),
        });
    }

    let channel = frame[0];
    let raw_value = u32::from_be_bytes([frame[1], frame[2], frame[3], frame[4]]);

    let max_raw = (1u64 << config.resolution_bits) - 1;
    let voltage = if max_raw > 0 {
        (raw_value as f64 / max_raw as f64) * config.reference_voltage
    } else {
        0.0
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(AdcReading {
        channel,
        raw_value,
        voltage,
        timestamp,
    })
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = AdcConfig::default();
        assert_eq!(cfg.sample_rate_hz, 100);
        assert_eq!(cfg.channels, vec![0]);
        assert_eq!(cfg.resolution_bits, 12);
        assert!((cfg.reference_voltage - 3.3).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_adc_frame_basic() {
        let config = AdcConfig {
            sample_rate_hz: 100,
            channels: vec![0],
            resolution_bits: 12,
            reference_voltage: 3.3,
        };

        // Channel 0, raw value = 2048 (mid-range for 12-bit)
        // 2048 in big-endian u32 = [0x00, 0x00, 0x08, 0x00]
        let frame: [u8; 5] = [0x00, 0x00, 0x00, 0x08, 0x00];
        let reading = parse_adc_frame(&frame, &config).unwrap();

        assert_eq!(reading.channel, 0);
        assert_eq!(reading.raw_value, 2048);
        // 2048 / 4095 * 3.3 ≈ 1.6504
        let expected_voltage = (2048.0 / 4095.0) * 3.3;
        assert!((reading.voltage - expected_voltage).abs() < 0.001);
    }

    #[test]
    fn test_parse_adc_frame_max_value() {
        let config = AdcConfig {
            sample_rate_hz: 100,
            channels: vec![0],
            resolution_bits: 12,
            reference_voltage: 5.0,
        };

        // Channel 1, raw value = 4095 (max for 12-bit)
        let frame: [u8; 5] = [0x01, 0x00, 0x00, 0x0F, 0xFF];
        let reading = parse_adc_frame(&frame, &config).unwrap();

        assert_eq!(reading.channel, 1);
        assert_eq!(reading.raw_value, 4095);
        assert!((reading.voltage - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_adc_frame_zero_value() {
        let config = AdcConfig {
            sample_rate_hz: 100,
            channels: vec![0],
            resolution_bits: 10,
            reference_voltage: 3.3,
        };

        // Channel 2, raw value = 0
        let frame: [u8; 5] = [0x02, 0x00, 0x00, 0x00, 0x00];
        let reading = parse_adc_frame(&frame, &config).unwrap();

        assert_eq!(reading.channel, 2);
        assert_eq!(reading.raw_value, 0);
        assert!((reading.voltage - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_adc_frame_too_short() {
        let config = AdcConfig::default();
        let frame: [u8; 3] = [0x00, 0x00, 0x01];
        let result = parse_adc_frame(&frame, &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("too short"));
    }

    #[test]
    fn test_adc_error_display() {
        let err = AdcError {
            message: "test error".to_string(),
        };
        assert_eq!(format!("{}", err), "test error");
    }

    #[test]
    fn test_configure_adc_invalid_sample_rate_zero() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let config = AdcConfig {
            sample_rate_hz: 0,
            ..AdcConfig::default()
        };
        let result = configure_adc(&shared, config);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("out of valid range"));
    }

    #[test]
    fn test_configure_adc_invalid_sample_rate_too_high() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let config = AdcConfig {
            sample_rate_hz: 10_001,
            ..AdcConfig::default()
        };
        let result = configure_adc(&shared, config);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("out of valid range"));
    }

    #[test]
    fn test_configure_adc_empty_channels() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let config = AdcConfig {
            channels: vec![],
            ..AdcConfig::default()
        };
        let result = configure_adc(&shared, config);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("At least one channel"));
    }

    #[test]
    fn test_configure_adc_invalid_resolution() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let config = AdcConfig {
            resolution_bits: 0,
            ..AdcConfig::default()
        };
        let result = configure_adc(&shared, config);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("Resolution"));
    }

    #[test]
    fn test_stop_continuous_when_not_active() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let result = stop_continuous_reading(&shared);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("not active"));
    }

    #[test]
    fn test_start_continuous_invalid_sample_rate() {
        let port = serial_port::create_shared_port();
        let shared = create_shared_adc(port);
        let result = start_continuous_reading(&shared, 0, 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("out of valid range"));
    }
}
