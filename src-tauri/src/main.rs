// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adc_driver;
mod commands;
mod i2c_driver;
mod serial_port;
mod spi_driver;

fn main() {
    // Create shared serial port state (initially no connection)
    let shared_port = serial_port::create_shared_port();

    // Create shared ADC state backed by the same serial port
    let shared_adc = adc_driver::create_shared_adc(shared_port.clone());

    // Create shared I2C and SPI states
    let shared_i2c = i2c_driver::create_shared_i2c();
    let shared_spi = spi_driver::create_shared_spi();

    tauri::Builder::default()
        .manage(shared_port)
        .manage(shared_adc)
        .manage(shared_i2c)
        .manage(shared_spi)
        .invoke_handler(tauri::generate_handler![
            // Serial port commands
            commands::list_ports,
            commands::connect_port,
            commands::disconnect_port,
            commands::write_data,
            // ADC commands
            commands::read_adc,
            // I2C commands
            commands::list_i2c_buses,
            commands::scan_i2c,
            commands::configure_i2c,
            commands::i2c_read,
            commands::i2c_write,
            commands::i2c_write_read,
            commands::start_i2c_continuous,
            commands::stop_i2c_continuous,
            // SPI commands
            commands::list_spi_buses,
            commands::configure_spi,
            commands::spi_transfer,
            commands::spi_write,
            commands::spi_read,
            commands::start_spi_continuous,
            commands::stop_spi_continuous,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
