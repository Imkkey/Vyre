<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Router, Route } from 'svelte-routing';
  import Login from './routes/Login.svelte';
  import Register from './routes/Register.svelte';
  import Home from './routes/Home.svelte';
  import Chat from './routes/Chat.svelte';
  import Friends from './routes/Friends.svelte';
  import ServerStatus from './components/ServerStatus.svelte';
  
  let isLoaded = false;
  let serverConnected = false;
  let serverError = '';
  let checkServerOnMount = true;
  let isAuthenticated = false;
  let activeServerId = null;

  // Примеры данных для серверов и каналов
  let servers = [];
  let directMessages = [];
  
  onMount(async () => {
    // Добавляем небольшую задержку для стабильности загрузки
    setTimeout(() => {
      isLoaded = true;
    }, 100);
    
    // Проверяем аутентификацию
    const token = localStorage.getItem('token');
    isAuthenticated = !!token;
    
    if (isAuthenticated) {
      loadServersAndChats();
    }
  });

  // Загрузка серверов и чатов
  async function loadServersAndChats() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    if (!token || !userId) return;
    
    try {
      // Загрузка серверов
      const serversResponse = await fetch('http://localhost:3000/api/servers/user', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (serversResponse.ok) {
        servers = await serversResponse.json();
      }
      
      // Загрузка личных чатов
      const chatsResponse = await fetch('http://localhost:3000/api/chats/direct/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (chatsResponse.ok) {
        directMessages = await chatsResponse.json();
      }
    } catch (error) {
      console.error('Ошибка при загрузке данных:', error);
    }
  }
  
  // Определяем, нужно ли заменить URL Tauri на основе среды выполнения
  let url = '';
  
  // Обработчик навигации между компонентами
  function handleNavigate(event) {
    const path = event.detail;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('popstate'));
  }
  
  // Обработчик изменения статуса сервера
  function handleServerStatusChange(event) {
    const { status, error } = event.detail;
    serverConnected = status === 'connected';
    if (error) {
      serverError = error;
    }
  }
  
  // Обработчик кнопки "Продолжить" после подключения сервера
  function handleContinue() {
    checkServerOnMount = false; // Отключаем автоматическую проверку на будущее
  }
  
  // Навигация к серверу
  function navigateToServer(serverId) {
    activeServerId = serverId;
    handleNavigate({ detail: `/server/${serverId}` });
  }
  
  // Навигация к чату
  function navigateToChat(chatId) {
    handleNavigate({ detail: `/chat/${chatId}` });
  }
  
  // Навигация к друзьям
  function navigateToFriends() {
    handleNavigate({ detail: '/friends' });
  }
  
  // Навигация домой
  function navigateToHome() {
    handleNavigate({ detail: '/home' });
  }
  
  // Выход из учетной записи
  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    isAuthenticated = false;
    handleNavigate({ detail: '/' });
  }
</script>

<div id="app">
  {#if isLoaded}
    <Router {url}>
      {#if !isAuthenticated}
        <Route path="/">
          <Login on:navigate={handleNavigate} />
        </Route>
        <Route path="/register">
          <Register on:navigate={handleNavigate} />
        </Route>
      {:else}
        <!-- Основной интерфейс с боковыми панелями -->
        <div class="app-layout">
          <!-- Панель серверов -->
          <div class="servers-sidebar">
            <div class="server-item home" on:click={navigateToHome}>
              <svg width="28" height="20" viewBox="0 0 28 20">
                <path fill="currentColor" d="M23.0212 1.67671C21.3107 0.879656 19.5079 0.318797 17.6584 0C17.4062 0.461742 17.1749 0.934541 16.9708 1.4184C15.003 1.12145 12.9974 1.12145 11.0283 1.4184C10.819 0.934541 10.589 0.461744 10.3368 0.00546311C8.48074 0.324393 6.67795 0.885118 4.96746 1.68231C1.56727 6.77853 0.649666 11.7538 1.11108 16.652C3.10102 18.1418 5.3262 19.2743 7.69177 20C8.22338 19.2743 8.69519 18.4993 9.09812 17.691C8.32996 17.3997 7.58522 17.0424 6.87684 16.6135C7.06531 16.4762 7.24726 16.3387 7.42403 16.1847C11.5911 18.1749 16.408 18.1749 20.5763 16.1847C20.7531 16.3332 20.9351 16.4762 21.1171 16.6135C20.41 17.0369 19.6639 17.3997 18.897 17.691C19.3052 18.4993 19.7718 19.2689 20.3021 19.9945C22.6677 19.2689 24.8929 18.1364 26.8828 16.6466H26.8893C27.43 10.9731 25.9665 6.04728 23.0212 1.67671ZM9.68041 13.6383C8.39754 13.6383 7.34085 12.4453 7.34085 10.994C7.34085 9.54272 8.37155 8.34973 9.68041 8.34973C10.9893 8.34973 12.0395 9.54272 12.0187 10.994C12.0187 12.4453 10.9828 13.6383 9.68041 13.6383ZM18.3161 13.6383C17.0332 13.6383 15.9765 12.4453 15.9765 10.994C15.9765 9.54272 17.0124 8.34973 18.3161 8.34973C19.6184 8.34973 20.6751 9.54272 20.6543 10.994C20.6543 12.4453 19.6184 13.6383 18.3161 13.6383Z"></path>
              </svg>
            </div>
            
            <div class="server-divider"></div>
            
            {#each servers as server}
              <div class="server-item" class:active={activeServerId === server.id} on:click={() => navigateToServer(server.id)}>
                {#if server.icon}
                  <img src={server.icon} alt={server.name} />
                {:else}
                  <div class="server-icon">{server.name.charAt(0)}</div>
                {/if}
              </div>
            {/each}
            
            <div class="server-item add-server">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z"></path>
              </svg>
            </div>
          </div>
          
          <!-- Панель каналов/чатов -->
          <div class="channels-sidebar">
            <div class="channels-header">
              <h3>Личные сообщения</h3>
            </div>
            
            <div class="channels-section">
              <div class="channels-category" on:click={navigateToFriends}>
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M13 10a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0-6a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm-1 10H8a5 5 0 0 0-5 5v2h14v-2a5 5 0 0 0-5-5zm-6 5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H6z"></path>
                </svg>
                <span>Друзья</span>
              </div>
              
              {#each directMessages as chat}
                <div class="channel-item" on:click={() => navigateToChat(chat.id)}>
                  <div class="channel-icon">
                    {chat.name.charAt(0)}
                  </div>
                  <span>{chat.name}</span>
                </div>
              {/each}
            </div>
            
            <div class="user-controls">
              <div class="user-info">
                <div class="user-avatar">
                  {(localStorage.getItem('username') || 'U').charAt(0).toUpperCase()}
                </div>
                <span class="username">{localStorage.getItem('username') || 'Пользователь'}</span>
              </div>
              <button class="logout-button" on:click={handleLogout}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 16H7V5h10v14z"></path>
                  <rect x="9" y="5" width="6" height="2" fill="currentColor"></rect>
                  <rect x="9" y="17" width="6" height="2" fill="currentColor"></rect>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Основное содержимое -->
          <div class="content">
            <Route path="/home">
              <Home on:navigate={handleNavigate} />
            </Route>
            <Route path="/chat/:id" let:params>
              <Chat chatId={params.id} on:navigate={handleNavigate} />
            </Route>
            <Route path="/server/:id" let:params>
              <Home serverId={params.id} on:navigate={handleNavigate} />
            </Route>
            <Route path="/friends">
              <Friends on:navigate={handleNavigate} />
            </Route>
          </div>
        </div>
      {/if}
    </Router>
    
    <!-- Компонент статуса сервера -->
    {#if checkServerOnMount}
      <ServerStatus 
        hideWhenConnected={true}
        on:statusChange={handleServerStatusChange}
        on:continue={handleContinue}
      />
    {/if}
  {:else}
    <div class="loading-container">
      <span class="loading-spinner"></span>
      <p>Загрузка приложения...</p>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --color-primary: #646cff;
    --color-primary-hover: #7c83ff;
    --color-primary-disabled: #3a3f8c;
    --color-accent: #38bdf8;
    --color-secondary: #f43f5e;
    --color-background: #0f172a;
    --color-surface: #1e293b;
    --color-channel-list: #1a1d29;
    --color-channel-hover: #252a3a;
    --color-input-background: #1e293b;
    --color-text-primary: #f8fafc;
    --color-text-secondary: #cbd5e1;
    --color-text-muted: #64748b;
    --header-height: 48px;
    --input-height: 44px;
    --members-list-width: 240px;
    --servers-sidebar-width: 72px;
    --channels-sidebar-width: 240px;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: var(--color-background);
    color: var(--color-text-primary);
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }
  
  :global(button) {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  
  :global(.btn-primary) {
    background-color: var(--color-primary);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  :global(.btn-primary:hover) {
    background-color: var(--color-primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  :global(.btn-primary:disabled) {
    background-color: var(--color-primary-disabled);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
  
  :global(a) {
    color: var(--color-primary);
    text-decoration: none;
  }
  
  :global(a:hover) {
    text-decoration: underline;
  }
  
  :global(input) {
    background-color: var(--color-input-background);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--color-text-primary);
    padding: 10px 12px;
    width: 100%;
    box-sizing: border-box;
    font-size: 14px;
    transition: border-color 0.2s;
  }
  
  :global(input:focus) {
    outline: none;
    border-color: var(--color-primary);
  }
  
  :global(.auth-card) {
    background-color: rgba(30, 41, 59, 0.8);
    border-radius: 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: 32px;
    width: 400px;
    max-width: 90%;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }
  
  .loading-spinner {
    display: inline-block;
    width: 40px;
    height: 40px;
    border: 3px solid rgba(100, 108, 255, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-primary);
    animation: spin 1s ease-in-out infinite;
    margin-bottom: 16px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  #app {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .app-layout {
    display: flex;
    height: 100vh;
    width: 100vw;
  }
  
  /* Боковая панель серверов */
  .servers-sidebar {
    width: var(--servers-sidebar-width);
    height: 100%;
    background-color: #0f141e;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    overflow-y: auto;
    flex-shrink: 0;
  }
  
  .server-item {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    margin-bottom: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #2e3440;
    color: var(--color-text-primary);
    transition: all 0.2s ease;
    position: relative;
  }
  
  .server-item:hover {
    border-radius: 16px;
    background-color: var(--color-primary);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }
  
  .server-item.active {
    border-radius: 16px;
    background-color: var(--color-primary);
  }
  
  .server-item.active::before {
    content: '';
    position: absolute;
    left: -8px;
    width: 4px;
    height: 24px;
    background-color: var(--color-accent);
    border-radius: 0 4px 4px 0;
  }
  
  .server-item.home {
    background-color: #36393f;
  }
  
  .server-divider {
    width: 32px;
    height: 2px;
    background-color: #2e3440;
    margin: 8px 0;
    border-radius: 1px;
  }
  
  .server-icon {
    font-weight: 600;
    font-size: 18px;
  }
  
  .server-item.add-server {
    background-color: #2e3440;
    color: #43b581;
  }
  
  /* Боковая панель каналов */
  .channels-sidebar {
    width: var(--channels-sidebar-width);
    height: 100%;
    background-color: var(--color-channel-list);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    box-shadow: 1px 0 1px rgba(0, 0, 0, 0.1);
  }
  
  .channels-header {
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .channels-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .channels-section {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  
  .channels-category {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background-color 0.1s;
  }
  
  .channels-category:hover {
    background-color: var(--color-channel-hover);
  }
  
  .channels-category svg {
    margin-right: 8px;
    width: 20px;
    height: 20px;
  }
  
  .channel-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 4px;
    margin: 0 8px;
    transition: background-color 0.1s;
  }
  
  .channel-item:hover {
    background-color: var(--color-channel-hover);
    color: var(--color-text-primary);
  }
  
  .channel-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    margin-right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }
  
  .user-controls {
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: rgba(0, 0, 0, 0.15);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .user-info {
    display: flex;
    align-items: center;
    flex: 1;
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    margin-right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }
  
  .username {
    color: var(--color-text-primary);
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .logout-button {
    background-color: transparent;
    color: var(--color-text-secondary);
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.1s;
  }
  
  .logout-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--color-secondary);
  }
  
  /* Основное содержимое */
  .content {
    flex: 1;
    height: 100%;
    overflow: hidden;
    background-color: var(--color-background);
  }
</style>
