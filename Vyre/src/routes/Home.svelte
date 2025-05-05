<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import ChatListItem from '../components/ChatListItem.svelte';
  import ServerStatus from '../components/ServerStatus.svelte';
  
  const dispatch = createEventDispatcher();
  
  // Add serverId property to receive from parent component
  export let serverId: string | null = null;
  
  interface ChatType {
    id: number;
    name: string;
    created_at: string;
    lastMessage?: string;
    unreadCount?: number;
  }
  
  interface UserType {
    id: number;
    username: string;
    is_online: number;
  }
  
  let chats: ChatType[] = [];
  let users: UserType[] = [];
  let loading = true;
  let error = '';
  let username = '';
  let socket: Socket | null = null;
  let serverAvailable = false; // Флаг доступности сервера
  let showServerStatus = false; // Флаг для отображения компонента ServerStatus
  
  // Статистика пользователей
  let onlineCount = 0;
  let offlineCount = 0;
  
  // Функция для проверки доступности сервера
  async function checkServerAvailability() {
    try {
      console.log('Проверка доступности сервера...');
      const healthResponse = await fetch('http://localhost:3000/api/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (healthResponse.ok) {
        console.log('Сервер доступен!');
        serverAvailable = true;
        showServerStatus = false;
        return true;
      } else {
        console.error('Сервер вернул ошибку:', healthResponse.status);
        serverAvailable = false;
        showServerStatus = true;
        error = `Сервер недоступен. Код ошибки: ${healthResponse.status}`;
        return false;
      }
    } catch (err) {
      console.error('Ошибка при проверке сервера:', err);
      serverAvailable = false;
      showServerStatus = true;
      error = 'Не удалось подключиться к серверу. Убедитесь, что сервер запущен на localhost:3000';
      return false;
    }
  }
  
  // Функция для проверки валидности токена
  async function validateToken(token) {
    try {
      const response = await fetch('http://localhost:3000/api/auth/validate-token', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Токен недействителен или истек');
        return false;
      }
      
      // Получаем результат проверки токена
      const data = await response.json();
      
      // Если токен был обновлен на сервере, сохраняем новый токен
      if (data.renewed && data.token) {
        console.log('Токен обновлен');
        localStorage.setItem('token', data.token);
      }
      
      return true;
    } catch (err) {
      console.error('Ошибка при проверке токена:', err);
      // Проверяем если ошибка связана с недоступностью сервера
      await checkServerAvailability();
      return false;
    }
  }

  // Обработчик состояния сервера из компонента ServerStatus
  function handleServerStatusChange(event) {
    const { status } = event.detail;
    serverAvailable = status === 'connected';
    
    if (serverAvailable) {
      // Если сервер стал доступен, повторно загрузим данные
      loadData();
    }
  }
  
  // Функция для продолжения работы после восстановления сервера
  function handleContinue() {
    showServerStatus = false;
    loadData();
  }
  
  // Функция загрузки данных
  async function loadData() {
    loading = true;
    error = '';
    
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    username = localStorage.getItem('username') || '';
    
    if (!token || !userId) {
      dispatch('navigate', '/');
      return;
    }
    
    // Проверяем валидность токена
    const isTokenValid = await validateToken(token);
    if (!isTokenValid) {
      // Если токен невалидный, удаляем его из localStorage и перенаправляем на страницу логина
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      dispatch('navigate', '/');
      return;
    }
    
    // Проверяем доступность сервера перед выполнением запросов
    const isServerAvailable = await checkServerAvailability();
    if (!isServerAvailable) {
      loading = false;
      return;
    }
    
    try {
      // Получаем список чатов
      console.log(`Загрузка чатов для пользователя с ID: ${userId}`);
      const response = await fetch(`http://localhost:3000/api/chats/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Ошибка загрузки чатов: ${response.status}`, errorText);
        
        // Проверка на ошибку авторизации
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          error = 'Сессия истекла. Пожалуйста, войдите снова.';
          dispatch('navigate', '/');
          return;
        }
        
        throw new Error(`Не удалось загрузить чаты: ${errorText}`);
      }
      
      chats = await response.json();
      console.log('Загружено чатов:', chats.length);
      
      // Если выбран сервер, загружаем пользователей этого сервера
      if (serverId) {
        console.log(`Загрузка пользователей для сервера с ID: ${serverId}`);
        const serverMembersResponse = await fetch(`http://localhost:3000/api/servers/${serverId}/members`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!serverMembersResponse.ok) {
          const errorText = await serverMembersResponse.text();
          console.error(`Ошибка загрузки участников сервера: ${serverMembersResponse.status}`, errorText);
          throw new Error(`Не удалось загрузить участников сервера: ${errorText}`);
        }
        
        users = await serverMembersResponse.json();
      } else {
        // Если сервер не выбран, загружаем всех пользователей
        const usersResponse = await fetch('http://localhost:3000/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!usersResponse.ok) {
          const errorText = await usersResponse.text();
          console.error(`Ошибка загрузки пользователей: ${usersResponse.status}`, errorText);
          throw new Error(`Не удалось загрузить пользователей: ${errorText}`);
        }
        
        users = await usersResponse.json();
      }
      
      // Считаем статистику пользователей
      onlineCount = users.filter(user => user.is_online === 1).length;
      offlineCount = users.length - onlineCount;
      
      // Подключаемся к Socket.IO для получения обновлений в реальном времени
      socket = io('http://localhost:3000', {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket']
      });
      
      // Добавляем обработчик ошибок при соединении с Socket.IO
      socket.on('connect_error', (err) => {
        console.error('Ошибка подключения Socket.IO:', err.message);
        checkServerAvailability(); // Проверяем доступность сервера при ошибке подключения
      });
      
      // Слушаем изменения статуса пользователей
      socket.on('userStatusChanged', (data: { userId: number, isOnline: boolean, username: string }) => {
        console.log('Пользователь изменил статус:', data);
        
        // Если выбран конкретный сервер, проверяем принадлежит ли пользователь серверу
        if (serverId) {
          const userIndex = users.findIndex(user => user.id === data.userId);
          if (userIndex !== -1) {
            // Обновляем статус существующего пользователя в списке сервера
            users[userIndex].is_online = data.isOnline ? 1 : 0;
            users = [...users]; // Для того чтобы Svelte обновил компонент
            
            // Пересчитываем статистику
            onlineCount = users.filter(user => user.is_online === 1).length;
            offlineCount = users.length - onlineCount;
          }
        } else {
          // Если сервер не выбран, обновляем для всех пользователей
          const userIndex = users.findIndex(user => user.id === data.userId);
          
          if (userIndex !== -1) {
            // Обновляем статус существующего пользователя
            users[userIndex].is_online = data.isOnline ? 1 : 0;
            users = [...users]; // Для того чтобы Svelte обновил компонент
          } else {
            // Если пользователя нет в списке, добавляем его
            users = [...users, {
              id: data.userId,
              username: data.username,
              is_online: data.isOnline ? 1 : 0
            }];
          }
          
          // Пересчитываем статистику
          onlineCount = users.filter(user => user.is_online === 1).length;
          offlineCount = users.length - onlineCount;
        }
      });
      
    } catch (err) {
      console.error('Ошибка:', err);
      error = err instanceof Error ? err.message : 'Не удалось загрузить данные';
      
      // Проверяем, связана ли ошибка с недоступностью сервера
      if (err instanceof Error && 
          (err.message.includes('Failed to fetch') || 
           err.message.includes('NetworkError') ||
           err.message.includes('Network request failed'))) {
        await checkServerAvailability();
      }
    } finally {
      loading = false;
    }
  }
  
  onMount(async () => {
    await loadData();
  });
  
  // Reload data when serverId changes
  $: if (serverId !== undefined) {
    console.log(`ServerId changed to ${serverId}, reloading data...`);
    loadData();
  }
  
  onDestroy(() => {
    // Отключаем сокет при уничтожении компонента
    if (socket) {
      socket.disconnect();
    }
  });
  
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    dispatch('navigate', '/');
  }
  
  function goToChat(chatId: number | null): void {
    if (chatId === null) return;
    dispatch('navigate', `/chat/${chatId}`);
  }
</script>

<div class="main-content">
  {#if showServerStatus}
    <ServerStatus 
      hideWhenConnected={true}
      on:statusChange={handleServerStatusChange}
      on:continue={handleContinue}
    />
  {:else}
    <div class="chat-header">
      <div class="chat-header-left">
        <svg width="24" height="24" class="chat-header-hash" viewBox="0 0 24 24" aria-hidden="true" role="img">
          <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z"></path>
        </svg>
        <span class="chat-header-title">общее</span>
      </div>
      
      <div class="chat-header-right">
        <div class="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12.0002 10.586L16.9502 5.63599L18.3642 7.04999L13.4142 12L18.3642 16.95L16.9502 18.364L12.0002 13.414L7.05023 18.364L5.63623 16.95L10.5862 12L5.63623 7.04999L7.05023 5.63599L12.0002 10.586Z"></path>
          </svg>
        </div>
      </div>
    </div>
    
    <div class="chat-content-wrapper">
      <div class="chat-content welcome-container">
        {#if loading}
          <div class="loading-container">
            <span class="loading-spinner"></span>
          </div>
        {:else if error}
          <div class="error-message">
            {error}
            <button class="btn-retry" on:click={loadData}>Повторить попытку</button>
          </div>
        {:else}
          <div class="welcome-banner">
            <div class="welcome-image">
              <img src="https://discord.com/assets/2c21aeda16de354ba5334551a883b481.png" alt="Welcome" />
            </div>
            <h2 class="welcome-title">Добро пожаловать в Vyre!</h2>
            <p class="welcome-subtitle">Это ваш основной канал для общения!</p>
          </div>
        {/if}
      </div>
      
      <div class="member-list">
        <div class="member-group-title">В сети — {onlineCount}</div>
        {#each users.filter(user => user.is_online === 1) as user}
          <div class="member-item">
            <div class="member-avatar" style="position: relative">
              {user.username.charAt(0).toUpperCase()}
              <span class="status-online"></span>
            </div>
            <div class="member-name">{user.username}</div>
          </div>
        {/each}
        
        <div class="member-group-title">Не в сети — {offlineCount}</div>
        {#each users.filter(user => user.is_online === 0) as user}
          <div class="member-item">
            <div class="member-avatar">{user.username.charAt(0).toUpperCase()}</div>
            <div class="member-name">{user.username}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .main-content {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
  }
  
  .chat-content-wrapper {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  
  .chat-content {
    flex: 1;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 12px;
    margin: 0 16px;
  }
  
  .welcome-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
  }
  
  .welcome-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
    max-width: 600px;
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  
  .welcome-image {
    width: 160px;
    height: 160px;
    margin-bottom: 24px;
    filter: drop-shadow(0 8px 16px rgba(56, 189, 248, 0.2));
    transition: transform 0.3s ease;
  }
  
  .welcome-image:hover {
    transform: scale(1.05);
  }
  
  .welcome-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  
  .welcome-title {
    font-size: 32px;
    margin-bottom: 12px;
    color: var(--color-text-primary);
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .welcome-subtitle {
    font-size: 18px;
    color: var(--color-text-secondary);
    margin-bottom: 24px;
    line-height: 1.6;
  }
  
  .btn-primary {
    background-color: var(--color-accent);
    padding: 12px 24px;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 500;
  }
  
  .btn-primary:hover {
    background-color: var(--color-primary);
  }
  
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(56, 189, 248, 0.2);
    border-radius: 50%;
    border-top-color: var(--color-primary);
    animation: spin 1s ease-in-out infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .member-list {
    width: var(--members-list-width);
    height: 100%;
    overflow-y: auto;
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: 16px 8px 8px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0 12px 12px 0;
  }
  
  .member-group-title {
    color: var(--color-text-muted);
    text-transform: uppercase;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 16px 8px 4px;
    letter-spacing: 0.02em;
  }
  
  .member-item {
    display: flex;
    align-items: center;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 2px;
    transition: all 0.2s ease;
  }
  
  .member-item:hover {
    background-color: rgba(56, 189, 248, 0.08);
    transform: translateX(2px);
  }
  
  .member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    margin-right: 12px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    box-shadow: 0 2px 10px rgba(56, 189, 248, 0.2);
  }
  
  .member-name {
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    font-weight: 500;
  }
  
  .status-online {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #10B981;
    position: absolute;
    bottom: 0;
    right: 0;
    border: 2px solid var(--color-channel-list);
    box-shadow: 0 0 4px rgba(16, 185, 129, 0.6);
  }
  
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px 12px 0 0;
    margin: 16px 16px 0 16px;
  }
  
  .chat-header-left {
    display: flex;
    align-items: center;
  }
  
  .chat-header-hash {
    margin-right: 8px;
    font-size: 24px;
    color: var(--color-primary);
  }
  
  .chat-header-title {
    font-weight: 600;
    font-size: 1.125rem;
    color: var(--color-text-primary);
  }
  
  .chat-header-right {
    display: flex;
    gap: 16px;
  }
  
  .header-icon {
    color: var(--color-text-secondary);
    transition: all 0.2s ease;
    cursor: pointer;
  }
  
  .header-icon:hover {
    color: var(--color-primary);
    transform: scale(1.1);
  }

  .btn-retry {
    background-color: var(--color-primary);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    margin-top: 16px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }
  
  .btn-retry:hover {
    background-color: var(--color-primary-hover);
  }
  
  .error-message {
    color: #ef4444;
    text-align: center;
    font-size: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .gradient-text {
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-weight: 700;
  }
</style>