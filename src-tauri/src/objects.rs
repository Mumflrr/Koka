use serde::{Serialize, Deserialize};
use zeroize::Zeroize;
use std::{fmt};
use std::sync::atomic::{AtomicBool};
use std::sync::Arc;
use tokio::sync::Mutex;

pub type DbPool = r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>;

pub struct AppState {
    pub db_pool: DbPool,
    pub connect_info: Arc<Mutex<ConnectInfo>>,
    pub startup_complete: AtomicBool,
}

#[derive(Serialize, Deserialize, Zeroize, zeroize::ZeroizeOnDrop)]
pub struct StoredCredentials {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum EventType { Events, Schedules }

#[derive(Serialize, Deserialize, Clone)]
pub struct Class { 
    pub code: String, 
    pub name: String, 
    pub description: String, 
    pub classes: Vec<TimeBlock>, 
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TimeBlock { 
    pub section: String, 
    pub location: String, 
    pub days: [((i32, i32), bool); 5], 
    pub instructor: String, 
}

#[derive(Serialize, Deserialize)]
pub struct ScrapeClassesParameters { 
    pub params_checkbox: [bool; 3], 
    pub classes: Vec<ClassParam>, 
    pub events: Vec<EventParam>, 
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EventParam { 
    pub time: (i32, i32), 
    pub days: [bool; 5], 
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClassParam { 
    pub id: String, 
    pub code: String, 
    pub name: String, 
    pub section: String, 
    pub instructor: String, 
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NewEvent {
    pub title: String,
    pub start_time: i32,
    pub end_time: i32,
    pub day: i32,
    pub professor: String,
    pub description: String,
}

impl fmt::Display for Class {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}, {}, <", self.code, self.name)?;
        for (idx, item) in self.classes.iter().enumerate() {
            write!(f, "{}{}, [", if idx == 0 { "" } else { " & " }, item.section)?;
            for day in item.days {
                if day.1 { write!(f, "{:04}-{:04} ", day.0.0, day.0.1)?; }
                else { write!(f, " NA ")?; }
            }
            write!(f, "], {}, {}", item.location, item.instructor)?;
        }
        write!(f, ">, {}", self.description)
    }
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct ConnectInfo { pub os: String, pub version: String, }

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    pub title: String,
    #[serde(rename = "startTime")]
    pub start_time: i32,
    #[serde(rename = "endTime")]
    pub end_time: i32,
    pub day: i32,
    pub professor: String,
    pub description: String,
}