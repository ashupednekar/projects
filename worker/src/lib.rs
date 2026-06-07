use axum::{
    body::Body,
    http::{
        header::{
            ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
            ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_MAX_AGE,
        },
        HeaderValue, Method, Response, StatusCode,
    },
};
use tower_service::Service;
use worker::*;

pub mod adapters;
mod handlers;
mod router;

#[event(fetch)]
async fn fetch(
    req: HttpRequest,
    env: Env,
    _ctx: Context,
) -> Result<axum::http::Response<axum::body::Body>> {
    if req.method() == Method::OPTIONS {
        return preflight();
    }

    let db = env.d1("DB")?;
    let mut response = router::build_routes(db).call(req).await?;

    add_cors_headers(&mut response);
    Ok(response)
}

fn preflight() -> Result<Response<Body>> {
    let mut response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())?;
    add_cors_headers(&mut response);
    Ok(response)
}

fn add_cors_headers(response: &mut Response<Body>) {
    let headers = response.headers_mut();
    headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    headers.insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"),
    );
    headers.insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("content-type"),
    );
    headers.insert(ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("86400"));
}
