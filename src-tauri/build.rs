fn main() {
    // クライアント ID が変わったら作り直す
    println!("cargo:rerun-if-env-changed=FUMI_GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=FUMI_GOOGLE_CLIENT_SECRET");
    tauri_build::build()
}
