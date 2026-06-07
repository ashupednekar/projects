-- enumeration much?/..todo
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    title TEXT NOT NULL,
    description TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_completed
ON tasks(completed);
