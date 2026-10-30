//! Tauri iOS bridge for the native Fumi WidgetKit extension.
use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_fumi_widget);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("fumi-widget")
        .setup(|_app, api| {
            #[cfg(not(target_os = "ios"))]
            let _ = (&_app, &api);
            #[cfg(target_os = "ios")]
            api.register_ios_plugin(init_plugin_fumi_widget)?;
            Ok(())
        })
        .build()
}
