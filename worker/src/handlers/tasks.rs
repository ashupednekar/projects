use crate::{
    adapters::{repo::TaskRepository, spec::Task},
    router::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

type ApiResult = std::result::Result<Response, ApiError>;

#[derive(serde::Deserialize)]
pub(crate) struct CreateTask {
    title: String,
    description: Option<String>,
    completed: Option<bool>,
}

#[derive(serde::Deserialize)]
pub(crate) struct UpdateTask {
    title: Option<String>,
    description: Option<String>,
    completed: Option<bool>,
}

#[worker::send]
pub async fn list(State(state): State<AppState>) -> ApiResult {
    Ok(Json(Task::list(state.db.as_ref()).await?).into_response())
}

#[worker::send]
pub async fn get(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult {
    match Task::get(state.db.as_ref(), id).await? {
        Some(task) => Ok(Json(task).into_response()),
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

#[worker::send]
pub async fn create(State(state): State<AppState>, Json(input): Json<CreateTask>) -> ApiResult {
    let task = Task::create(
        state.db.as_ref(),
        input.title,
        input.description,
        input.completed,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(task)).into_response())
}

#[worker::send]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<UpdateTask>,
) -> ApiResult {
    match Task::update(
        state.db.as_ref(),
        id,
        input.title,
        input.description,
        input.completed,
    )
    .await?
    {
        Some(task) => Ok(Json(task).into_response()),
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

#[worker::send]
pub async fn delete(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult {
    if Task::delete(state.db.as_ref(), id).await? {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Ok(StatusCode::NOT_FOUND.into_response())
    }
}

#[worker::send]
pub async fn random(State(state): State<AppState>) -> ApiResult {
    match Task::random(state.db.as_ref()).await? {
        Some(task) => Ok(Json(task).into_response()),
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

pub enum ApiError {
    //TODO: see if u can use standard_error
    Worker(worker::Error),
}

impl From<worker::Error> for ApiError {
    fn from(error: worker::Error) -> Self {
        Self::Worker(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::Worker(error) => {
                let _error = error;
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error").into_response()
            }
        }
    }
}
