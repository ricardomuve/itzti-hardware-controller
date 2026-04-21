// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adc_driver;
mod audio_engine;
mod closed_loop;
mod commands;
mod i2c_driver;
mod safe_mode_defaults;
mod serial_port;
mod session_db;
mod spi_driver;
mod watchdog;

use tauri::Manager;

fn main() {
    // Create shared serial port state (initially no connection)
    let shared_port = serial_port::create_shared_port();

    // Create shared ADC state backed by the same serial port
    let shared_adc = adc_driver::create_shared_adc(shared_port.clone());

    // Create shared I2C and SPI states
    let shared_i2c = i2c_driver::create_shared_i2c();
    let shared_spi = spi_driver::create_shared_spi();

    tauri::Builder::default()
        .setup(|app| {
            // Resolve the app data directory for the SQLite database
            let app_data = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");
            std::fs::create_dir_all(&app_data).ok();
            let db_path = app_data.join("sessions.db");

            // Start the SQLite writer thread
            let db_writer = session_db::start_db_writer(db_path.clone());
            app.manage(db_writer);
            app.manage(commands::DbPath(db_path));

            // Start the closed-loop biometric control engine
            let closed_loop = closed_loop::start_closed_loop(app.handle().clone());
            app.manage(closed_loop);

            // Start the audio engine
            let audio = audio_engine::start_audio_engine();
            app.manage(audio);

            // Start the watchdog / safe mode manager
            let watchdog = watchdog::start_watchdog(
                shared_port.clone(),
                app.handle().clone(),
            );
            app.manage(watchdog);

            Ok(())
        })
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
            // Closed-loop biometric commands
            commands::push_biometric_batch,
            commands::push_biometric_sample,
            commands::update_thresholds,
            commands::start_biometric_session,
            commands::stop_biometric_session,
            commands::get_closed_loop_state,
            // Session database commands
            commands::db_create_session,
            commands::db_end_session,
            commands::db_push_sample,
            commands::db_push_event,
            commands::db_flush,
            commands::db_list_sessions,
            // Audio engine commands
            commands::audio_play,
            commands::audio_stop,
            commands::audio_set_volume,
            commands::audio_set_frequencies,
            commands::audio_get_state,
            // Watchdog / Safe Mode commands
            commands::watchdog_start,
            commands::watchdog_stop,
            commands::watchdog_force_safe_mode,
            commands::watchdog_exit_safe_mode,
            commands::watchdog_get_state,
            commands::get_safe_mode_defaults,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
