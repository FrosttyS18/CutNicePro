use super::super::types::Composition;
use crate::media_source::SourceStamp;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub fn key(
    document: &Composition,
    sources: &BTreeMap<String, SourceStamp>,
    toolchain: &str,
    options: &impl Serialize,
) -> Result<String, String> {
    let value = serde_json::to_value((
        "editor-render-contract-v1",
        document,
        sources,
        toolchain,
        options,
    ))
    .map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec(&canonical(value)).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn canonical(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(key, value)| (key, canonical(value)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(array) => Value::Array(array.into_iter().map(canonical).collect()),
        value => value,
    }
}
