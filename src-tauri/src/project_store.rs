use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub added_at: i64,
    pub last_opened_at: i64,
    /// Pinned entries are listed in their own group above everything else.
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub pinned_at: Option<i64>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoreData {
    projects: Vec<ProjectRecord>,
    last_active_id: Option<String>,
}

/// JSON-backed list of opened repositories, living in the app data dir.
pub struct ProjectStore {
    file: PathBuf,
    data: StoreData,
}

impl ProjectStore {
    pub fn load(app_data_dir: &Path) -> Result<Self, AppError> {
        fs::create_dir_all(app_data_dir)?;
        let file = app_data_dir.join("projects.json");
        let data = match fs::read_to_string(&file) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => StoreData::default(),
            Err(err) => return Err(AppError::Io(err)),
        };
        Ok(Self { file, data })
    }

    pub fn projects(&self) -> &[ProjectRecord] {
        &self.data.projects
    }

    pub fn last_active_id(&self) -> Option<&str> {
        self.data.last_active_id.as_deref()
    }

    pub fn find(&self, id: &str) -> Option<&ProjectRecord> {
        self.data.projects.iter().find(|project| project.id == id)
    }

    pub fn find_by_path(&self, path: &str) -> Option<&ProjectRecord> {
        self.data
            .projects
            .iter()
            .find(|project| project.path == path)
    }

    /// Insert or refresh a record. Returns true when a new project was added.
    pub fn upsert(&mut self, record: ProjectRecord) -> Result<bool, AppError> {
        let is_new = match self
            .data
            .projects
            .iter_mut()
            .find(|project| project.path == record.path || project.id == record.id)
        {
            Some(existing) => {
                existing.path = record.path;
                existing.name = record.name;
                existing.last_opened_at = record.last_opened_at;
                false
            }
            None => {
                self.data.projects.push(record);
                true
            }
        };
        self.save()?;
        Ok(is_new)
    }

    /// Pin / unpin an entry. `pinned_at` orders the pinned group newest first.
    pub fn set_pinned(&mut self, id: &str, pinned: bool, at: i64) -> Result<(), AppError> {
        let project = self
            .data
            .projects
            .iter_mut()
            .find(|project| project.id == id)
            .ok_or_else(|| AppError::NotFound(format!("项目 {id}")))?;
        project.pinned = pinned;
        project.pinned_at = if pinned { Some(at) } else { None };
        self.save()
    }

    pub fn remove(&mut self, id: &str) -> Result<(), AppError> {
        self.data.projects.retain(|project| project.id != id);
        if self.data.last_active_id.as_deref() == Some(id) {
            self.data.last_active_id = self.data.projects.first().map(|project| project.id.clone());
        }
        self.save()
    }

    pub fn set_last_active(&mut self, id: Option<String>) -> Result<(), AppError> {
        if let Some(id) = id.as_deref() {
            if self.find(id).is_none() {
                return Err(AppError::NotFound(format!("项目 {id}")));
            }
        }
        self.data.last_active_id = id;
        self.save()
    }

    fn save(&self) -> Result<(), AppError> {
        let tmp = self.file.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(&self.data)?;
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.file)?;
        Ok(())
    }
}
