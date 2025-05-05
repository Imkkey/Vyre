import './app.css';
import App from './App.svelte';

console.time('app-initialization');
console.log("main.ts loading started");

// Performance marking for debugging
performance.mark('app-init-start');

// Для предотвращения длительной блокировки в main thread
const initApp = () => {
  return new Promise((resolve) => {
    // Используем setTimeout с нулевой задержкой для освобождения основного потока
    setTimeout(() => {
      try {
        // Для Svelte 4 используем constructor pattern
        const app = new App({
          target: document.getElementById('app')
        });
        
        resolve(app);
      } catch (error) {
        console.error("Ошибка при инициализации приложения:", error);
        // Создаем базовое приложение для отображения сообщения об ошибке
        const fallbackApp = new App({
          target: document.getElementById('app')
        });
        
        resolve(fallbackApp);
      }
    }, 0);
  });
};

// Асинхронная инициализация приложения
initApp().then(app => {
  performance.mark('app-init-end');
  performance.measure('app-initialization', 'app-init-start', 'app-init-end');
  console.timeEnd('app-initialization');
  
  // Log performance measurement
  const appInitMeasure = performance.getEntriesByName('app-initialization')[0];
  console.log(`App initialization took: ${appInitMeasure?.duration.toFixed(2)}ms`);
  
  console.log("Приложение смонтировано");
  
  window.app = app;
}).catch(error => {
  console.error("Критическая ошибка при инициализации приложения:", error);
});

// Экспортируем promise для Vite hot-reload
export default initApp();
