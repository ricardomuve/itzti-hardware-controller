// src-tauri/src/session_db.rs
//
// Persistencia SQLite para sesiones biométricas.
// Usa un hilo dedicado de escritura con canal mpsc para no bloquear
// el hilo principal ni la UI. Los samples se acumulan en un buffer
// y se escriben en batch cada FLUSH_INTERVAL_MS o cuando el buffer
// alcanza BATCH_SIZE.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::closed_loop::{BiometricSample, BiometricSensorType, ThresholdViolation};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Flush buffered samples to SQLite every N milliseconds.
const FLUSH_INTERVAL_MS: u64 = 2000;

/// Maximum samples to buffer before forcing a flush.
const BATCH_SIZE: usize = 500;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub preset_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub preset_id: Option<String>,
    pub notes: Option<String>,
    pub sample_count: u64,
    pub event_count: u64,
}

// ---------------------------------------------------------------------------
// Messages for the writer thread
// ---------------------------------------------------------------------------

pub enum DbMessage {
    /// Create a new session record
    CreateSession(SessionRecord),
    /// End a session (set ended_at timestamp)
    EndSession { session_id: String, ended_at: u64 },
    /// Buffer a biometric sample for batch insert
    PushSample {
        session_id: String,
        sample: BiometricSample,
    },
    /// Record a threshold violation event
    PushEvent {
        session_id: String,
        violation: ThresholdViolation,
    },
    /// Force flush buffered samples to disk
    Flush,
    /// Shutdown the writer thread
    Shutdown,
}

// ---------------------------------------------------------------------------
// Writer handle
// ---------------------------------------------------------------------------

pub struct DbWriter {
    sender: mpsc::Sender<DbMessage>,
}

pub type SharedDbWriter = std::sync::Arc<std::sync::Mutex<DbWriter>>;

impl DbWriter {
    pub fn send(&self, msg: DbMessage) -> Result<(), String> {
        self.sender
            .send(msg)
            .map_err(|e| format!("DB writer send error: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Schema initialization
// ---------------------------------------------------------------------------

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            started_at  INTEGER NOT NULL,
            ended_at    INTEGER,
            preset_id   TEXT,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS biometric_samples (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            channel_id  TEXT NOT NULL,
            sensor_type TEXT NOT NULL,
            value       REAL NOT NULL,
            timestamp   INTEGER NOT NULL,
            eeg_delta   REAL,
            eeg_theta   REAL,
            eeg_alpha   REAL,
            eeg_beta    REAL,
            eeg_gamma   REAL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS threshold_events (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT NOT NULL,
            channel_id      TEXT NOT NULL,
            sensor_type     TEXT NOT NULL,
            current_value   REAL NOT NULL,
            threshold_min   REAL NOT NULL,
            threshold_max   REAL NOT NULL,
            action_type     TEXT NOT NULL,
            timestamp       INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_samples_session
            ON biometric_samples(session_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_samples_channel
            ON biometric_samples(channel_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_session
            ON threshold_events(session_id, timestamp);
        ",
    )
}

// ---------------------------------------------------------------------------
// Batch insert helpers
// ---------------------------------------------------------------------------

struct BufferedSample {
    session_id: String,
    sample: BiometricSample,
}

fn flush_samples(conn: &Connection, buffer: &[BufferedSample]) {
    if buffer.is_empty() {
        return;
    }

    let tx = match conn.unchecked_transaction() {
        Ok(tx) => tx,
        Err(e) => {
            eprintln!("[session_db] Transaction start error: {}", e);
            return;
        }
    };

    {
        let mut stmt = match tx.prepare_cached(
            "INSERT INTO biometric_samples
             (session_id, channel_id, sensor_type, value, timestamp,
              eeg_delta, eeg_theta, eeg_alpha, eeg_beta, eeg_gamma)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        ) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[session_db] Prepare error: {}", e);
                return;
            }
        };

        for item in buffer {
            let sensor_type_str = format!("{:?}", item.sample.sensor_type);
            let (d, t, a, b, g) = match &item.sample.eeg_bands {
                Some(bands) => (
                    Some(bands.delta),
                    Some(bands.theta),
                    Some(bands.alpha),
                    Some(bands.beta),
                    Some(bands.gamma),
                ),
                None => (None, None, None, None, None),
            };

            if let Err(e) = stmt.execute(params![
                item.session_id,
                item.sample.channel_id,
                sensor_type_str,
                item.sample.value,
                item.sample.timestamp,
                d, t, a, b, g,
            ]) {
                eprintln!("[session_db] Insert error: {}", e);
            }
        }
    }

    if let Err(e) = tx.commit() {
        eprintln!("[session_db] Commit error: {}", e);
    }
}

// ---------------------------------------------------------------------------
// Writer thread
// ---------------------------------------------------------------------------

/// Starts the SQLite writer on a dedicated thread.
///
/// The database file is created at `db_path`. Returns a `SharedDbWriter`
/// handle for sending messages from Tauri commands.
pub fn start_db_writer(db_path: PathBuf) -> SharedDbWriter {
    let (tx, rx) = mpsc::channel::<DbMessage>();

    thread::spawn(move || {
        // Open SQLite with WAL mode for better concurrent read performance
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[session_db] Failed to open database: {}", e);
                return;
            }
        };

        // WAL mode + synchronous NORMAL for performance
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -8000;
             PRAGMA temp_store = MEMORY;",
        );

        if let Err(e) = init_schema(&conn) {
            eprintln!("[session_db] Schema init error: {}", e);
            return;
        }

        let mut sample_buffer: Vec<BufferedSample> = Vec::with_capacity(BATCH_SIZE);
        let mut last_flush = Instant::now();

        loop {
            // Drain all pending messages (non-blocking)
            loop {
                match rx.try_recv() {
                    Ok(DbMessage::CreateSession(record)) => {
                        if let Err(e) = conn.execute(
                            "INSERT INTO sessions (id, started_at, ended_at, preset_id, notes)
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![
                                record.id,
                                record.started_at,
                                record.ended_at,
                                record.preset_id,
                                record.notes,
                            ],
                        ) {
                            eprintln!("[session_db] Create session error: {}", e);
                        }
                    }
                    Ok(DbMessage::EndSession { session_id, ended_at }) => {
                        // Flush pending samples first
                        flush_samples(&conn, &sample_buffer);
                        sample_buffer.clear();

                        if let Err(e) = conn.execute(
                            "UPDATE sessions SET ended_at = ?1 WHERE id = ?2",
                            params![ended_at, session_id],
                        ) {
                            eprintln!("[session_db] End session error: {}", e);
                        }
                    }
                    Ok(DbMessage::PushSample { session_id, sample }) => {
                        sample_buffer.push(BufferedSample { session_id, sample });
                    }
                    Ok(DbMessage::PushEvent { session_id, violation }) => {
                        let sensor_type_str = format!("{:?}", violation.sensor_type);
                        if let Err(e) = conn.execute(
                            "INSERT INTO threshold_events
                             (session_id, channel_id, sensor_type, current_value,
                              threshold_min, threshold_max, action_type, timestamp)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            params![
                                session_id,
                                violation.channel_id,
                                sensor_type_str,
                                violation.current_value,
                                violation.threshold_min,
                                violation.threshold_max,
                                violation.action.action_type,
                                violation.timestamp,
                            ],
                        ) {
                            eprintln!("[session_db] Insert event error: {}", e);
                        }
                    }
                    Ok(DbMessage::Flush) => {
                        flush_samples(&conn, &sample_buffer);
                        sample_buffer.clear();
                        last_flush = Instant::now();
                    }
                    Ok(DbMessage::Shutdown) => {
                        // Final flush before exit
                        flush_samples(&conn, &sample_buffer);
                        return;
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => {
                        flush_samples(&conn, &sample_buffer);
                        return;
                    }
                }
            }

            // Auto-flush on batch size or interval
            let should_flush = sample_buffer.len() >= BATCH_SIZE
                || (last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                    && !sample_buffer.is_empty());

            if should_flush {
                flush_samples(&conn, &sample_buffer);
                sample_buffer.clear();
                last_flush = Instant::now();
            }

            // Sleep briefly to avoid busy-waiting
            thread::sleep(Duration::from_millis(50));
        }
    });

    std::sync::Arc::new(std::sync::Mutex::new(DbWriter { sender: tx }))
}
