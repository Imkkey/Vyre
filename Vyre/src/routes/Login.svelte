<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let username: string = '';
  let password: string = '';
  let loading: boolean = false;
  let error: string = '';
  let serverAvailable: boolean = true;
  
  async function checkServerAvailability() {
    try {
      // Исправляем URL для проверки - используем эндпоинт /api/health вместо /api
      const response = await fetch('http://localhost:3000/api/health');
      serverAvailable = response.ok;
      if (!serverAvailable) {
        error = 'Сервер недоступен. Проверьте, запущен ли сервер на localhost:3000';
      }
    } catch (err) {
      console.error('Сервер недоступен:', err);
      serverAvailable = false;
      error = 'Не удалось подключиться к серверу. Убедитесь, что сервер запущен на localhost:3000';
    }
  }
  
  async function handleLogin() {
    loading = true;
    error = '';
    
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Ошибка входа');
      }
      
      // Сохраняем токен и данные пользователя
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', username);
      
      // Отправляем событие навигации вместо изменения window.location
      dispatch('navigate', '/home');
      
    } catch (err) {
      console.error('Ошибка:', err);
      error = err instanceof Error ? err.message : 'Что-то пошло не так';
    } finally {
      loading = false;
    }
  }
  
  function goToRegister() {
    dispatch('navigate', '/register');
  }
  
  onMount(async () => {
    // Проверяем доступность сервера
    await checkServerAvailability();
    
    if (!serverAvailable) {
      return;
    }
    
    // Проверяем, есть ли сохраненный токен
    const token = localStorage.getItem('token');
    if (token) {
      // Если есть токен, проверяем его валидность
      try {
        const response = await fetch('http://localhost:3000/api/auth/validate-token', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // Если токен валидный, обновляем его, если он был обновлен на сервере
          if (data.renewed && data.token) {
            console.log('Токен обновлен');
            localStorage.setItem('token', data.token);
          }
          
          // Перенаправляем на главную страницу
          dispatch('navigate', '/home');
        } else {
          // Если токен недействителен, удаляем его
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          error = 'Ваша сессия истекла. Пожалуйста, войдите снова.';
        }
      } catch (err) {
        console.error('Ошибка при проверке токена:', err);
        // Не удалось проверить токен, но не показываем ошибку
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
      }
    }
    
    console.log('Компонент Login загружен');
  });
</script>

<div class="auth-container">
  <div class="auth-card">
    <div class="auth-header">
      <h1>Vyre</h1>
      <p>Войдите в свой аккаунт</p>
    </div>
    
    <form class="space-y-4" on:submit|preventDefault={handleLogin}>
      {#if error}
        <div class="error-message">
          {error}
        </div>
      {/if}
      
      <div class="form-group">
        <label for="username">Имя пользователя</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          required
          placeholder="Введите имя пользователя"
        />
      </div>
      
      <div class="form-group">
        <label for="password">Пароль</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          placeholder="Введите пароль"
        />
      </div>
      
      <div>
        <button
          type="submit"
          disabled={loading || !serverAvailable}
          class="w-full btn-primary"
        >
          {#if loading}
            <span class="loading-spinner"></span>
            Вход...
          {:else}
            Войти
          {/if}
        </button>
      </div>
      
      <div class="text-center">
        <p>
          Нет аккаунта?
          <button class="text-link" on:click={goToRegister}>
            Зарегистрироваться
          </button>
        </p>
      </div>
    </form>
  </div>
</div>

<style>
  .auth-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    background: radial-gradient(ellipse at top, #1e3a8a 0%, #0f172a 50%);
    position: relative;
    overflow: hidden;
  }
  
  /* Добавляем декоративные элементы в стиле glassmorphism */
  .auth-container::before {
    content: "";
    position: absolute;
    width: 300px;
    height: 300px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    border-radius: 50%;
    top: -100px;
    left: -100px;
    filter: blur(80px);
    opacity: 0.15;
    z-index: 0;
  }
  
  .auth-container::after {
    content: "";
    position: absolute;
    width: 250px;
    height: 250px;
    background: linear-gradient(135deg, var(--color-secondary) 0%, var(--color-accent) 100%);
    border-radius: 50%;
    bottom: -100px;
    right: -100px;
    filter: blur(80px);
    opacity: 0.15;
    z-index: 0;
  }
  
  .auth-card {
    position: relative;
    z-index: 1;
    width: 400px;
    max-width: 90%;
    background-color: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    -webkit-background-clip: padding-box;
    background-clip: padding-box;
  }
  
  .auth-header {
    text-align: center;
    margin-bottom: 24px;
  }
  
  .auth-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
  }
  
  .auth-header p {
    color: var(--color-text-secondary);
    font-size: 1.1rem;
  }
  
  .form-group {
    margin-bottom: 16px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: var(--color-text-secondary);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.3px;
  }
  
  .error-message {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    padding: 12px;
    border-radius: 12px;
    margin-bottom: 16px;
    font-size: 14px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  
  .loading-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s ease-in-out infinite;
    margin-right: 8px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .space-y-4 > * + * {
    margin-top: 16px;
  }
  
  .w-full {
    width: 100%;
  }
  
  .text-center {
    text-align: center;
    margin-top: 16px;
    color: var(--color-text-secondary);
  }
  
  .text-link {
    color: var(--color-primary);
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    font-weight: 500;
    transition: color 0.2s;
  }
  
  .text-link:hover {
    text-decoration: underline;
    color: var(--color-accent);
    background: none;
    transform: none;
    box-shadow: none;
  }
</style>