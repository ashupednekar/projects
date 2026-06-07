use super::handlers;
use axum::{routing::get, Router};
use std::sync::Arc;
use worker::D1Database;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<D1Database>,
}

pub fn build_routes(db: D1Database) -> Router {
    Router::new()
        .route("/livez", get(handlers::probes::livez))
        .route(
            "/tasks",
            get(handlers::tasks::list).post(handlers::tasks::create),
        )
        .route("/tasks/random", get(handlers::tasks::random))
        .route(
            "/tasks/{id}",
            get(handlers::tasks::get)
                .put(handlers::tasks::update)
                .delete(handlers::tasks::delete),
        )
        .with_state(AppState { db: Arc::new(db) })
}
