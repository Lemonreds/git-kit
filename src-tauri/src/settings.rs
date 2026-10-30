use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::model::{AppSettings, BranchTemplate, default_date_format};

/// Seeded on first launch so the "新建分支" dialog is useful immediately.
fn default_settings() -> AppSettings {
    AppSettings {
        branch_templates: vec![BranchTemplate {
            id: "default-prod".to_string(),
            name: "生产基线".to_string(),
            rule: "prod_{date}_BASE".to_string(),
            date_format: default_date_format(),
            updated_at: 0,
        }],
        default_template_id: Some("default-prod".to_string()),
    }
}

/// Branch-name templates, stored next to `projects.json`.
pub struct SettingsStore {
    file: PathBuf,
    data: AppSettings,
}

impl SettingsStore {
    pub fn load(app_data_dir: &Path) -> Result<Self, AppError> {
        fs::create_dir_all(app_data_dir)?;
        let file = app_data_dir.join("settings.json");
        let data = match fs::read_to_string(&file) {
            Ok(raw) => {
                let parsed: AppSettings = serde_json::from_str(&raw).unwrap_or_default();
                if parsed.branch_templates.is_empty() && parsed.default_template_id.is_none() {
                    // Partially written / hand-edited empty file: keep it usable.
                    default_settings()
                } else {
                    parsed
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => default_settings(),
            Err(err) => return Err(AppError::Io(err)),
        };
        Ok(Self { file, data })
    }

    pub fn settings(&self) -> AppSettings {
        self.data.clone()
    }

    /// Replace the whole template list. Validation stays here so the UI can not
    /// persist a rule that can never produce a branch name.
    pub fn save_templates(
        &mut self,
        templates: Vec<BranchTemplate>,
        default_id: Option<String>,
    ) -> Result<AppSettings, AppError> {
        let mut seen_ids: Vec<String> = Vec::with_capacity(templates.len());
        for template in &templates {
            let id = template.id.trim();
            if id.is_empty() {
                return Err(AppError::message("模板 ID 不能为空"));
            }
            if seen_ids.iter().any(|seen| seen == id) {
                return Err(AppError::message(format!("模板 ID 重复：{id}")));
            }
            seen_ids.push(id.to_string());

            if template.name.trim().is_empty() {
                return Err(AppError::message("模板名称不能为空"));
            }
            if template.rule.trim().is_empty() {
                return Err(AppError::message(format!(
                    "模板「{}」的规则不能为空",
                    template.name.trim()
                )));
            }
            validate_date_format(&template.date_format)?;
        }

        let default_id = default_id.filter(|id| seen_ids.iter().any(|seen| seen == id));
        self.data.branch_templates = templates;
        self.data.default_template_id = default_id;
        self.save()?;
        Ok(self.data.clone())
    }

    fn save(&self) -> Result<(), AppError> {
        let tmp = self.file.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(&self.data)?;
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.file)?;
        Ok(())
    }
}

fn validate_date_format(format: &str) -> Result<(), AppError> {
    match format {
        "yyyyMMdd" | "yyyy-MM-dd" | "yyyyMMdd-HHmm" => Ok(()),
        other => Err(AppError::message(format!("不支持的日期格式：{other}"))),
    }
}
