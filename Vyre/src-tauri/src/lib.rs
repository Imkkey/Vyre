#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use log::{info, warn, LevelFilter};

use std::time::Instant;
use tauri::{Manager};

// Команда для закрытия окна
#[tauri::command]
fn close_window(window: tauri::Window) {
    let window_label = window.label().to_string();
    info!("Запрошено закрытие окна: {}", window_label);
    
    window.close().unwrap_or_else(|e| {
        warn!("Ошибка при закрытии окна {}: {}", window_label, e);
    });
}

// Команда для проверки готовности бэкенда
#[tauri::command]
fn backend_ready() -> bool {
    info!("Backend is ready");
    true
}

// Функция для запуска из main.rs
pub fn run() {
    // Настройка логирования
    env_logger::builder()
        .filter_level(LevelFilter::Info)
        .init();
    
    let start = Instant::now();
    info!("Запуск Tauri приложения");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![close_window, backend_ready])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            // Убираем предупреждение о неиспользуемой переменной
            let _app_handle = app.handle();
            
            // Получение главного окна
            if let Some(window) = app.get_window("main") {
                let _win_handle = window.clone();
                
                // Оптимизация загрузки окна
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        info!("Запрошено закрытие окна");
                    }
                    tauri::WindowEvent::Destroyed => {
                        info!("Окно уничтожено");
                    }
                    tauri::WindowEvent::Focused(focused) => {
                        info!("Изменился фокус окна: {}", focused);
                    }
                    _ => {}
                });

                // Инициализация с помощью асинхронного кода
                // Это предотвратит блокировку основного потока
                // let _window_arc = Arc::new(win_handle);
                // Закомментировано для временного отключения загрузки
                // async_runtime::spawn(async move {
                //     info!("Starting async task");
                //     tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                //     if let Err(e) = window_arc.emit("backend-ready", true) {
                //         warn!("Failed to emit backend-ready event: {}", e);
                //     } else {
                //         info!("backend-ready event emitted successfully");
                //     }
                // });
            } else {
                warn!("Главное окно не найдено, пропуск установки обработчиков событий");
            }
            
            info!("Настройка Tauri завершена за {:?}", start.elapsed());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ошибка при запуске приложения Tauri");
}