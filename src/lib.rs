//! Centerline, the Rust rewrite of the web half. Phase 1 starts the real code; until then this
//! crate holds one function so the gate has something to build, lint and test.

/// The version in `Cargo.toml`, baked in at compile time by the `env!` macro.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_cargo_toml() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
        assert!(!version().is_empty());
    }
}
