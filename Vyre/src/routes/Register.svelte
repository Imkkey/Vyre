<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let username: string = '';
  let email: string = '';
  let password: string = '';
  let confirmPassword: string = '';
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
  
  async function handleRegister() {
    if (password !== confirmPassword) {
      error = 'Пароли не совпадают';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      const response = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          email,
          password
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Ошибка при регистрации');
      }
      
      // Сохраняем токен и данные пользователя
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', username);
      
      // Переходим на главную страницу
      dispatch('navigate', '/home');
      
    } catch (err) {
      console.error('Ошибка:', err);
      error = err instanceof Error ? err.message : 'Что-то пошло не так';
    } finally {
      loading = false;
    }
  }
  
  function goToLogin() {
    dispatch('navigate', '/');
  }
  
  onMount(async () => {
    // Проверяем, есть ли сохраненный токен
    const token = localStorage.getItem('token');
    if (token) {
      // Если токен существует, перенаправляем на главную страницу
      dispatch('navigate', '/home');
    } else {
      // Проверяем доступность сервера
      await checkServerAvailability();
    }
  });
</script>

<div class="auth-container">
  <div class="auth-card">
    <div class="auth-header">
      <h1>Vyre</h1>
      <p>Создайте аккаунт</p>
    </div>
    
    <form class="space-y-4" on:submit|preventDefault={handleRegister}>
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
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          required
          placeholder="Введите ваш email"
        />
      </div>
      
      <div class="form-group">
        <label for="password">Пароль</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          placeholder="Минимум 6 символов"
        />
      </div>
      
      <div class="form-group">
        <label for="confirmPassword">Подтвердите пароль</label>
        <input
          id="confirmPassword"
          type="password"
          bind:value={confirmPassword}
          required
          placeholder="Повторите пароль"
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
            Регистрация...
          {:else}
            Зарегистрироваться
          {/if}
        </button>
      </div>
      
      <div class="text-center">
        <p>
          Уже есть аккаунт?
          <button class="text-link" on:click={goToLogin}>
            Войти
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
  }
  
  .text-link:hover {
    text-decoration: underline;
    background: none;
    transform: none;
    box-shadow: none;
  }
</style>