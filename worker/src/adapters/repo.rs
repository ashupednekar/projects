use super::spec::Task;
use worker::{wasm_bindgen::JsValue, D1Database, Error, Result};

#[allow(async_fn_in_trait)]
pub trait TaskRepository {
    async fn list(db: &D1Database) -> Result<Vec<Task>>;
    async fn get(db: &D1Database, id: i64) -> Result<Option<Task>>;
    async fn create(
        db: &D1Database,
        title: String,
        description: Option<String>,
        completed: Option<bool>,
    ) -> Result<Task>;
    async fn update(
        db: &D1Database,
        id: i64,
        title: Option<String>,
        description: Option<String>,
        completed: Option<bool>,
    ) -> Result<Option<Task>>;
    async fn delete(db: &D1Database, id: i64) -> Result<bool>;
    async fn random(db: &D1Database) -> Result<Option<Task>>;
}

#[derive(serde::Deserialize)]
struct TaskRow {
    id: i64,
    title: String,
    description: Option<String>,
    completed: i64, //sqlite doesn't support bool, hence the mirror struct
    created_at: String,
    updated_at: String,
}

impl From<TaskRow> for Task {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            description: row.description,
            completed: row.completed != 0,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl TaskRepository for Task {
    async fn list(db: &D1Database) -> Result<Vec<Task>> {
        let rows = db
            .prepare(
                "SELECT id, title, description, completed, created_at, updated_at
                 FROM tasks
                 ORDER BY id DESC",
            )
            .all()
            .await?
            .results::<TaskRow>()?;

        Ok(rows.into_iter().map(Task::from).collect())
    }

    async fn get(db: &D1Database, id: i64) -> Result<Option<Task>> {
        let id = JsValue::from_f64(id as f64);
        let row = db
            .prepare(
                "SELECT id, title, description, completed, created_at, updated_at
                 FROM tasks
                 WHERE id = ?1",
            )
            .bind(&[id])?
            .first::<TaskRow>(None)
            .await?;

        Ok(row.map(Task::from))
    }

    async fn create(
        db: &D1Database,
        title: String,
        description: Option<String>,
        completed: Option<bool>,
    ) -> Result<Task> {
        let title = JsValue::from_str(&title);
        let description = description
            .as_deref()
            .map_or_else(JsValue::null, JsValue::from_str);
        let completed = bool_value(completed.unwrap_or(false));

        let result = db
            .prepare(
                "INSERT INTO tasks (title, description, completed)
             VALUES (?1, ?2, ?3)",
            )
            .bind(&[title, description, completed])?
            .run()
            .await?;

        let id = result
            .meta()?
            .and_then(|meta| meta.last_row_id)
            .ok_or_else(|| Error::RustError("task was not created".to_string()))?;

        Self::get(db, id)
            .await?
            .ok_or_else(|| Error::RustError("task was not created".to_string()))
    }

    async fn update(
        db: &D1Database,
        id: i64,
        title: Option<String>,
        description: Option<String>,
        completed: Option<bool>,
    ) -> Result<Option<Task>> {
        let title = title.map_or_else(JsValue::null, |title| JsValue::from_str(&title));
        let description =
            description.map_or_else(JsValue::null, |description| JsValue::from_str(&description));
        let completed = completed.map_or_else(JsValue::null, bool_value);
        let id_value = JsValue::from_f64(id as f64);

        db.prepare(
            "UPDATE tasks
             SET title = COALESCE(?1, title),
                 description = COALESCE(?2, description),
                 completed = COALESCE(?3, completed),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?4",
        )
        .bind(&[title, description, completed, id_value])?
        .run()
        .await?;

        Self::get(db, id).await
    }

    async fn delete(db: &D1Database, id: i64) -> Result<bool> {
        let id = JsValue::from_f64(id as f64);
        let result = db
            .prepare("DELETE FROM tasks WHERE id = ?1")
            .bind(&[id])?
            .run()
            .await?;

        let changes = result.meta()?.and_then(|meta| meta.changes).unwrap_or(0);
        Ok(changes > 0)
    }

    async fn random(db: &D1Database) -> Result<Option<Task>> {
        let row = db
            .prepare(
                "SELECT id, title, description, completed, created_at, updated_at
                 FROM tasks
                 WHERE completed = 0
                 ORDER BY RANDOM()
                 LIMIT 1",
            )
            .first::<TaskRow>(None)
            .await?;

        Ok(row.map(Task::from))
    }
}

fn bool_value(value: bool) -> JsValue {
    JsValue::from_f64(if value { 1.0 } else { 0.0 })
}
