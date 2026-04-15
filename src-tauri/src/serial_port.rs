use serde::Serialize;
use serialport::{self, SerialPort};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Information about an available serial port.
#[derive(Debug, Clone, Serialize)]
pub struct SerialPortInfo {
    pub path: String,
    pub manufacturer: Option<String>,
    pub vendor_id: Option<String>,
    pub product_id: Option<String>,
}

/// Error type for serial port operations.
#[derive(Debug, Clone, Serialize)]
pub struct SerialPortError {
    pub message: String,
}

impl std::fmt::Display for SerialPortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<serialport::Error> for SerialPortError {
    fn from(err: serialport::Error) -> Self {
        SerialPortError {
            message: format!("Serial port error: {}", err),
        }
    }
}

impl From<std::io::Error> for SerialPortError {
    fn from(err: std::io::Error) -> Self {
        SerialPortError {
            message: format!("IO error: {}", err),
        }
    }
}

/// Shared state holding the currently active serial port connection.
pub type SharedPort = Arc<Mutex<Option<Box<dyn SerialPort>>>>;

/// Creates a new shared port state initialized to `None` (no active connection).
pub fn create_shared_port() -> SharedPort {
    Arc::new(Mutex::new(None))
}

/// Lists all available serial ports on the system.
///
/// Returns port path, manufacturer, vendor ID, and product ID when available.
/// Satisfies Requirement 1.1: list all devices on USB/Serial ports.
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, SerialPortError> {
    let ports = serialport::available_ports()?;
    let port_infos = ports
        .into_iter()
        .map(|p| {
            let (manufacturer, vendor_id, product_id) = match &p.port_type {
                serialport::SerialPortType::UsbPort(usb) => (
                    usb.manufacturer.clone(),
                    Some(format!("{:04x}", usb.vid)),
                    Some(format!("{:04x}", usb.pid)),
                ),
                _ => (None, None, None),
            };
            SerialPortInfo {
                path: p.port_name,
                manufacturer,
                vendor_id,
                product_id,
            }
        })
        .collect();
    Ok(port_infos)
}

/// Opens a serial port at the given path with the specified baud rate.
///
/// Stores the opened port in the shared state. If a port is already open,
/// it will be closed first before opening the new one.
/// Satisfies Requirement 1.2: establish connection through a serial channel.
pub fn open_port(
    shared: &SharedPort,
    path: &str,
    baud_rate: u32,
) -> Result<(), SerialPortError> {
    let port = serialport::new(path, baud_rate)
        .timeout(Duration::from_millis(3000))
        .open()?;

    let mut guard = shared.lock().map_err(|e| SerialPortError {
        message: format!("Failed to acquire port lock: {}", e),
    })?;

    // Close any existing connection before storing the new one
    *guard = Some(port);
    Ok(())
}

/// Closes the currently active serial port connection.
///
/// Releases the port so it can be used by other applications.
/// Satisfies Requirement 1.5: close the serial channel and release the port.
pub fn close_port(shared: &SharedPort) -> Result<(), SerialPortError> {
    let mut guard = shared.lock().map_err(|e| SerialPortError {
        message: format!("Failed to acquire port lock: {}", e),
    })?;

    if guard.is_none() {
        return Err(SerialPortError {
            message: "No port is currently open".to_string(),
        });
    }

    // Dropping the port closes it and releases system resources
    *guard = None;
    Ok(())
}

/// Writes data bytes to the currently active serial port.
///
/// Satisfies Requirement 8.2: communicate with devices through native serial APIs.
pub fn write_to_port(shared: &SharedPort, data: &[u8]) -> Result<(), SerialPortError> {
    let mut guard = shared.lock().map_err(|e| SerialPortError {
        message: format!("Failed to acquire port lock: {}", e),
    })?;

    match guard.as_mut() {
        Some(port) => {
            port.write_all(data)?;
            port.flush()?;
            Ok(())
        }
        None => Err(SerialPortError {
            message: "No port is currently open".to_string(),
        }),
    }
}

/// Reads available bytes from the currently active serial port.
///
/// Returns whatever bytes are currently available in the port buffer,
/// up to 1024 bytes per read. Returns an empty vec if no data is available.
/// Satisfies Requirement 8.2: communicate with devices through native serial APIs.
pub fn read_from_port(shared: &SharedPort) -> Result<Vec<u8>, SerialPortError> {
    let mut guard = shared.lock().map_err(|e| SerialPortError {
        message: format!("Failed to acquire port lock: {}", e),
    })?;

    match guard.as_mut() {
        Some(port) => {
            let bytes_available = port.bytes_to_read().map_err(|e| SerialPortError {
                message: format!("Failed to check available bytes: {}", e),
            })? as usize;

            if bytes_available == 0 {
                return Ok(vec![]);
            }

            let read_size = bytes_available.min(1024);
            let mut buf = vec![0u8; read_size];
            let bytes_read = port.read(&mut buf)?;
            buf.truncate(bytes_read);
            Ok(buf)
        }
        None => Err(SerialPortError {
            message: "No port is currently open".to_string(),
        }),
    }
}
