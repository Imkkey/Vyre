<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let serverUrl: string = 'http://localhost:3000';
  export let hideWhenConnected: boolean = false;
  export let autoRetry: boolean = true;
  export let retryInterval: number = 5000; // По умолчанию повторная попытка каждые 5 секунд

  const dispatch = createEventDispatcher();

  let status: 'checking' | 'connected' | 'disconnected' = 'checking';
  let lastChecked = Date.now();
  let checkCount = 0;
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let errorMessage = '';
  let isStartingServer = false;

  // Функция для проверки доступности сервера
  async function checkServerStatus() {
    checkCount++;
    lastChecked = Date.now();
    
    try {
      const healthResponse = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // Устанавливаем таймаут, чтобы не ждать слишком долго
        signal: AbortSignal.timeout(3000) // Используем AbortSignal для установки таймаута
      });
      
      if (healthResponse.ok) {
        status = 'connected';
        errorMessage = '';
        dispatch('statusChange', { status: 'connected' });
        console.log('Сервер доступен!');
      } else {
        status = 'disconnected';
        errorMessage = `Сервер вернул ошибку: ${healthResponse.status}`;
        dispatch('statusChange', { status: 'disconnected', error: errorMessage });
        console.error('Сервер вернул ошибку:', healthResponse.status);
      }
    } catch (err) {
      status = 'disconnected';
      errorMessage = 'Не удалось подключиться к серверу. Убедитесь, что сервер запущен на localhost:3000';
      dispatch('statusChange', { status: 'disconnected', error: errorMessage });
      console.error('Ошибка при проверке сервера:', err);
    }
  }

  // Функция для запуска сервера
  async function startServer() {
    isStartingServer = true;
    
    try {
      // Проверяем, доступно ли Tauri API
      if (window.__TAURI__) {
        // Используем Tauri для запуска сервера
        const { invoke, shell } = window.__TAURI__;
        
        try {
          // Попытка запустить серверный процесс через Tauri
          await invoke('start_backend_server');
          console.log('Сервер запущен через Tauri API');
          
          // Ждем немного, чтобы сервер успел запуститься
          setTimeout(checkServerStatus, 2000);
        } catch (tauriError) {
          console.error('Ошибка при запуске сервера через Tauri:', tauriError);
          
          // Резервный вариант - открыть внешний скрипт для запуска сервера
          try {
            await shell.open('cmd://c%20start%20cmd%20/k%20cd%20%2FVyreBackend%20%26%26%20npm%20start');
            console.log('Запущен внешний скрипт для старта сервера');
            // Ждем дольше, так как запуск через внешний скрипт может занять больше времени
            setTimeout(checkServerStatus, 5000);
          } catch (shellError) {
            console.error('Ошибка при открытии внешнего скрипта:', shellError);
            errorMessage = 'Не удалось запустить сервер. Пожалуйста, запустите сервер вручную.';
          }
        }
      } else {
        // Без Tauri можем только предложить пользователю запустить сервер вручную
        console.warn('Tauri API не доступно, невозможно запустить сервер автоматически');
        errorMessage = 'Запустите сервер вручную, выполнив команду "npm start" в папке VyreBackend.';
      }
    } catch (error) {
      console.error('Ошибка при запуске сервера:', error);
      errorMessage = 'Произошла ошибка при попытке запуска сервера.';
    } finally {
      isStartingServer = false;
    }
  }

  onMount(() => {
    // Немедленно проверяем статус сервера
    checkServerStatus();
    
    // Устанавливаем интервал проверки, если включен autoRetry
    if (autoRetry) {
      checkInterval = setInterval(checkServerStatus, retryInterval);
    }
  });

  onDestroy(() => {
    // Очищаем интервал при уничтожении компонента
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  });
</script>

{#if status !== 'connected' || !hideWhenConnected}
<div class="server-status-container {status}">
  <div class="server-status-content">
    <div class="server-status-icon">
      {#if status === 'checking'}
        <div class="status-spinner"></div>
      {:else if status === 'connected'}
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M21.707 5.293l-3-3a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 0 1.414l3 3a1 1 0 0 0 1.414 0l7-7a1 1 0 0 0 0-1.414zM16 10.414l-1.707-1.707L19.586 3.414l1.707 1.707L16 10.414zm-6 2.172L8.293 11l6-6L16 6.586l-6 6zm-2.793-.879l-5.5 5.5a1 1 0 0 0 0 1.414l3 3a1 1 0 0 0 1.414 0l5.5-5.5-4.414-4.414zm-3.086 7.5L2.5 17.586l3.293-3.293L7.914 16.5l-3.793 3.793z"/>
        </svg>
      {:else}
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm3.707-11.707a1 1 0 0 0-1.414 0L12 10.586l-2.293-2.293a1 1 0 1 0-1.414 1.414L10.586 12l-2.293 2.293a1 1 0 1 0 1.414 1.414L12 13.414l2.293 2.293a1 1 0 0 0 1.414-1.414L13.414 12l2.293-2.293a1 1 0 0 0 0-1.414z"/>
        </svg>
      {/if}
    </div>

    <div class="server-status-info">
      <h3>Статус сервера</h3>
      {#if status === 'checking'}
        <p>Проверка соединения с сервером...</p>
      {:else if status === 'connected'}
        <p>Сервер подключен и работает</p>
      {:else}
        <p class="error-message">{errorMessage || 'Сервер недоступен. Проверьте, запущен ли сервер на localhost:3000'}</p>
      {/if}
    </div>

    <div class="server-status-actions">
      {#if status === 'disconnected'}
        <button 
          class="status-button retry"
          disabled={isStartingServer}
          on:click={() => checkServerStatus()}>
          Проверить снова
        </button>
        <button 
          class="status-button start"
          disabled={isStartingServer}
          on:click={() => startServer()}>
          {isStartingServer ? 'Запуск...' : 'Запустить сервер'}
        </button>
      {:else if status === 'connected'}
        <button 
          class="status-button"
          on:click={() => dispatch('continue')}>
          Продолжить
        </button>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .server-status-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(15, 23, 42, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
  }

  .server-status-content {
    background-color: #1e293b;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 450px;
    width: 90%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .server-status-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    margin-bottom: 16px;
  }

  .connected .server-status-icon {
    color: #10b981;
    background-color: rgba(16, 185, 129, 0.1);
  }

  .disconnected .server-status-icon {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }

  .checking .server-status-icon {
    color: #f59e0b;
    background-color: rgba(245, 158, 11, 0.1);
  }

  .server-status-info h3 {
    margin: 0 0 8px 0;
    font-size: 1.5rem;
    color: #f8fafc;
  }

  .server-status-info p {
    margin: 0;
    color: #cbd5e1;
    font-size: 1rem;
    line-height: 1.5;
  }

  .error-message {
    color: #ef4444 !important;
  }

  .server-status-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .status-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.1s;
  }

  .status-button:hover:not(:disabled) {
    background-color: #2563eb;
    transform: translateY(-1px);
  }

  .status-button:active:not(:disabled) {
    transform: translateY(1px);
  }

  .status-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-button.retry {
    background-color: #6b7280;
  }
  
  .status-button.retry:hover:not(:disabled) {
    background-color: #4b5563;
  }

  .status-button.start {
    background-color: #10b981;
  }
  
  .status-button.start:hover:not(:disabled) {
    background-color: #059669;
  }

  .status-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(245, 158, 11, 0.25);
    border-top-color: #f59e0b;
    border-radius: 50%;
    animation: spin 1s ease-in-out infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>