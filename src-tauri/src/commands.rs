use std::thread;
use std::time::Duration;

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