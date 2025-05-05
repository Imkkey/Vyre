// Утилиты для работы с окном Tauri
import { appWindow } from "@tauri-apps/api/window";
import { once, emit, listen } from '@tauri-apps/api/event';

// Событие, сигнализирующее о готовности интерфейса
const UI_READY_EVENT = "ui-ready";
// Событие от бэкенда, сигнализирующее о его готовности
const BACKEND_READY_EVENT = "backend-ready";

// Максимальное время ожидания готовности бэкенда (мс)
const BACKEND_READY_TIMEOUT = 5000;

/**
 * Инициализирует окно приложения и обеспечивает правильную последовательность загрузки
 */
export async function initializeWindow() {
  console.log("Инициализация окна приложения");
  await appWindow.show();
}

/**
 * Показывает окно, когда UI будет готов
 */
async function showWindowWhenReady() {
    try {
        // Устанавливаем обработчик на событие готовности UI
        const unlistenUiReady = await listen(UI_READY_EVENT, async () => {
            console.log("UI готов, показываем окно");
            await appWindow.show();
            unlistenUiReady();
        });
        
        // Добавляем обработчик ошибок
        window.addEventListener('error', async (event) => {
            console.error('Перехвачена ошибка:', event.error);
            // В случае критической ошибки все равно показываем окно
            await appWindow.show();
        });
        
        return true;
    } catch (error) {
        console.error("Ошибка при настройке показа окна:", error);
        // В случае ошибки все равно пытаемся показать окно
        await appWindow.show();
        return false;
    }
}

/**
 * Сигнализирует о готовности UI к отображению
 */
export async function signalUiReady() {
    console.log("Сигнализируем о готовности UI");
    try {
        await emit(UI_READY_EVENT, { ready: true });
        return true;
    } catch (error) {
        console.error("Ошибка при отправке сигнала о готовности UI:", error);
        // В случае ошибки все равно пытаемся показать окно
        await appWindow.show();
        return false;
    }
}

// Экспортируем апи окна для удобного доступа
export { appWindow };