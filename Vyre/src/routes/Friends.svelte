<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import ServerStatus from '../components/ServerStatus.svelte';
  
  const dispatch = createEventDispatcher();
  
  interface UserType {
    id: number;
    username: string;
    is_online: number;
    friendship_status?: 'friends' | 'pending_outgoing' | 'pending_incoming' | 'none';
  }
  
  interface DirectMessageType {
    id: number;
    userId: number;
    username: string;
    avatar: string;
    isOnline: boolean;
    lastMessage?: string;
    unreadCount?: number;
  }
  
  interface FriendRequest {
    id: number;
    sender_id: number;
    receiver_id: number;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    username: string;
    is_online: number;
  }
  
  let users: UserType[] = [];
  let friends: UserType[] = [];
  let pendingIncomingRequests: FriendRequest[] = [];
  let pendingOutgoingRequests: FriendRequest[] = [];
  let directMessages: DirectMessageType[] = [];
  let loading = true;
  let error = '';
  let socket: Socket | null = null;
  let searchQuery = '';
  let serverAvailable = true;
  let showServerStatus = false;
  
  // Статистика пользователей
  let onlineCount = 0;
  let offlineCount = 0;
  let pendingCount = 0;
  let blockedCount = 0;
  
  // Активный чат
  let activeDirectMessage: number | null = null;
  
  // Активная категория (все, онлайн, ожидание, заблокированные)
  let activeTab = 'online';
  
  // Модальное окно для создания нового личного чата
  let showNewMessageModal = false;
  let selectedUser: UserType | null = null;
  
  // Получение списка друзей
  async function fetchFriends() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    if (!token || !userId) return;
    
    try {
      // Получаем список друзей
      const response = await fetch('http://localhost:3000/api/friends', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось загрузить список друзей');
      }
      
      const friendsData = await response.json();
      friends = friendsData.filter(friend => friend.id.toString() !== userId);
      
      // Обновляем счетчики
      onlineCount = friends.filter(friend => friend.is_online === 1).length;
      offlineCount = friends.length - onlineCount;
      
      // Получаем список входящих заявок в друзья
      const incomingResponse = await fetch('http://localhost:3000/api/friends/requests/incoming', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (incomingResponse.ok) {
        pendingIncomingRequests = await incomingResponse.json();
        pendingCount = pendingIncomingRequests.length;
      }
      
      // Получаем список исходящих заявок в друзья
      const outgoingResponse = await fetch('http://localhost:3000/api/friends/requests/outgoing', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (outgoingResponse.ok) {
        pendingOutgoingRequests = await outgoingResponse.json();
      }
      
      // Обновляем статусы дружбы для всех пользователей
      for (const user of users) {
        if (friends.some(friend => friend.id === user.id)) {
          user.friendship_status = 'friends';
        } else if (pendingIncomingRequests.some(req => req.sender_id === user.id)) {
          user.friendship_status = 'pending_incoming';
        } else if (pendingOutgoingRequests.some(req => req.receiver_id === user.id)) {
          user.friendship_status = 'pending_outgoing';
        } else {
          user.friendship_status = 'none';
        }
      }
      
    } catch (err) {
      console.error('Ошибка при загрузке друзей:', err);
    }
  }
  
  // Функция отправки заявки в друзья
  async function sendFriendRequest(userId: number) {
    const token = localStorage.getItem('token');
    
    if (!token) return;
    
    try {
      const response = await fetch('http://localhost:3000/api/friends/request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: userId })
      });
      
      if (!response.ok) {
        throw new Error('Не удалось отправить заявку в друзья');
      }
      
      // Обновляем статус дружбы
      const userIndex = users.findIndex(user => user.id === userId);
      if (userIndex !== -1) {
        users[userIndex].friendship_status = 'pending_outgoing';
        users = [...users];
      }
      
      // Обновляем список друзей и заявок
      await fetchFriends();
      
    } catch (err) {
      console.error('Ошибка при отправке заявки в друзья:', err);
      alert('Не удалось отправить заявку в друзья');
    }
  }
  
  // Функция принятия заявки в друзья
  async function acceptFriendRequest(requestId: number) {
    const token = localStorage.getItem('token');
    
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:3000/api/friends/request/${requestId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось принять заявку в друзья');
      }
      
      // Обновляем список друзей и заявок
      await fetchFriends();
      
    } catch (err) {
      console.error('Ошибка при принятии заявки в друзья:', err);
      alert('Не удалось принять заявку в друзья');
    }
  }
  
  // Функция отклонения заявки в друзья
  async function rejectFriendRequest(requestId: number) {
    const token = localStorage.getItem('token');
    
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:3000/api/friends/request/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось отклонить заявку в друзья');
      }
      
      // Обновляем список друзей и заявок
      await fetchFriends();
      
    } catch (err) {
      console.error('Ошибка при отклонении заявки в друзья:', err);
      alert('Не удалось отклонить заявку в друзья');
    }
  }
  
  // Функция удаления друга
  async function removeFriend(userId: number) {
    const token = localStorage.getItem('token');
    
    if (!token) return;
    
    try {
      const response = await fetch(`http://localhost:3000/api/friends/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось удалить друга');
      }
      
      // Обновляем список друзей
      await fetchFriends();
      
    } catch (err) {
      console.error('Ошибка при удалении друга:', err);
      alert('Не удалось удалить друга');
    }
  }
  
  onMount(async () => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    if (!token || !userId) {
      dispatch('navigate', '/');
      return;
    }
    
    try {
      // Получаем список пользователей для отображения
      const response = await fetch('http://localhost:3000/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось загрузить пользователей');
      }
      
      users = await response.json();
      
      // Получаем список друзей
      await fetchFriends();
      
      // Получаем список личных чатов пользователя с сервера
      const directChatsResponse = await fetch('http://localhost:3000/api/chats/direct/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!directChatsResponse.ok) {
        throw new Error('Не удалось загрузить личные чаты');
      }
      
      const directChatsData = await directChatsResponse.json();
      
      // Преобразуем данные с сервера в формат для отображения
      directMessages = directChatsData.map(chat => {
        // Находим другого пользователя в чате (не текущего)
        const otherUser = chat.users.find(u => u.id.toString() !== userId);
        return {
          id: chat.id,
          userId: otherUser ? otherUser.id : 0,
          username: chat.name,
          avatar: otherUser ? otherUser.username.charAt(0).toUpperCase() : chat.name.charAt(0).toUpperCase(),
          isOnline: otherUser ? otherUser.is_online === 1 : false,
          lastMessage: chat.lastMessage || 'Нет сообщений',
          unreadCount: 0 // TODO: реализовать счетчик непрочитанных сообщений
        };
      });
      
      // Эти категории пока не реализованы, но для интерфейса добавим
      blockedCount = 0;
      
      // Подключаемся к Socket.IO для получения обновлений в реальном времени
      socket = io('http://localhost:3000', {
        auth: { token }
      });
      
      // Слушаем изменения статуса пользователей
      socket.on('userStatusChanged', (data: { userId: number, isOnline: boolean, username: string }) => {
        console.log('Пользователь изменил статус:', data);
        
        // Обновляем статус пользователя в списке
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
            is_online: data.isOnline ? 1 : 0,
            friendship_status: 'none'
          }];
        }
        
        // Обновляем статус в списке друзей
        const friendIndex = friends.findIndex(friend => friend.id === data.userId);
        if (friendIndex !== -1) {
          friends[friendIndex].is_online = data.isOnline ? 1 : 0;
          friends = [...friends];
          
          // Пересчитываем статистику
          onlineCount = friends.filter(friend => friend.is_online === 1).length;
          offlineCount = friends.length - onlineCount;
        }
        
        // Обновляем статус в списке личных сообщений
        const dmIndex = directMessages.findIndex(dm => dm.userId === data.userId);
        if (dmIndex !== -1) {
          directMessages[dmIndex].isOnline = data.isOnline;
          directMessages = [...directMessages];
        }
      });
      
      // Слушаем новые личные сообщения
      socket.on('newDirectMessage', (data) => {
        console.log('Новое личное сообщение:', data);
        
        // Находим чат в списке
        const dmIndex = directMessages.findIndex(dm => dm.id === data.chat_id);
        if (dmIndex !== -1) {
          // Обновляем последнее сообщение
          directMessages[dmIndex].lastMessage = data.content;
          // Увеличиваем счетчик непрочитанных сообщений, если чат не активен
          if (activeDirectMessage !== data.chat_id) {
            directMessages[dmIndex].unreadCount = (directMessages[dmIndex].unreadCount || 0) + 1;
          }
          directMessages = [...directMessages];
        } else {
          // Если чата нет в списке, добавляем его (получаем информацию с сервера)
          refreshDirectChats();
        }
      });
      
      // Слушаем события дружбы
      socket.on('friendRequest', async () => {
        // Обновляем список заявок в друзья
        await fetchFriends();
      });
      
      socket.on('friendRequestAccepted', async () => {
        // Обновляем список друзей
        await fetchFriends();
      });
      
      socket.on('friendRequestRejected', async () => {
        // Обновляем список заявок в друзья
        await fetchFriends();
      });
      
      socket.on('friendRemoved', async () => {
        // Обновляем список друзей
        await fetchFriends();
      });
      
    } catch (err) {
      console.error('Ошибка:', err);
      error = err instanceof Error ? err.message : 'Не удалось загрузить пользователей';
    } finally {
      loading = false;
    }
  });
  
  onDestroy(() => {
    // Отключаем сокет при уничтожении компонента
    if (socket) {
      socket.disconnect();
    }
  });
  
  // Функция для обновления списка личных чатов
  async function refreshDirectChats() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    if (!token || !userId) return;
    
    try {
      const response = await fetch('http://localhost:3000/api/chats/direct/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Не удалось обновить список личных чатов');
      }
      
      const directChatsData = await response.json();
      
      // Преобразуем данные с сервера в формат для отображения
      directMessages = directChatsData.map(chat => {
        // Находим другого пользователя в чате (не текущего)
        const otherUser = chat.users.find(u => u.id.toString() !== userId);
        return {
          id: chat.id,
          userId: otherUser ? otherUser.id : 0,
          username: chat.name,
          avatar: otherUser ? otherUser.username.charAt(0).toUpperCase() : chat.name.charAt(0).toUpperCase(),
          isOnline: otherUser ? otherUser.is_online === 1 : false,
          lastMessage: chat.lastMessage || 'Нет сообщений',
          unreadCount: 0 // В будущем можно добавить счетчик непрочитанных сообщений
        };
      });
    } catch (err) {
      console.error('Ошибка при обновлении списка личных чатов:', err);
    }
  }
  
  function setActiveTab(tab: string) {
    activeTab = tab;
  }
  
  async function startChat(userId: number) {
    const token = localStorage.getItem('token');
    
    if (!token) {
      dispatch('navigate', '/');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:3000/api/chats/direct', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_user_id: userId })
      });
      
      if (!response.ok) {
        throw new Error('Не удалось создать личный чат');
      }
      
      const data = await response.json();
      
      // Обновляем список личных чатов
      await refreshDirectChats();
      
      // Открываем созданный чат
      openDirectMessage(data.chatId);
      
    } catch (err) {
      console.error('Ошибка при создании личного чата:', err);
      alert('Не удалось создать личный чат');
    }
  }
  
  function openDirectMessage(dmId: number) {
    activeDirectMessage = dmId;
    
    // Сбрасываем счетчик непрочитанных сообщений
    const dmIndex = directMessages.findIndex(dm => dm.id === dmId);
    if (dmIndex !== -1 && directMessages[dmIndex].unreadCount) {
      directMessages[dmIndex].unreadCount = 0;
      directMessages = [...directMessages];
    }
    
    // Переходим на страницу чата
    dispatch('navigate', `/chat/${dmId}`);
  }
  
  function createNewDirectMessage() {
    showNewMessageModal = true;
  }
  
  function closeNewMessageModal() {
    showNewMessageModal = false;
    selectedUser = null;
  }
  
  function selectUserForDirectMessage(user: UserType) {
    selectedUser = user;
  }
  
  async function confirmNewDirectMessage() {
    if (!selectedUser) return;
    
    await startChat(selectedUser.id);
    closeNewMessageModal();
  }
  
  // Фильтрация друзей по поиску и активной вкладке
  $: filteredFriends = friends.filter(friend => {
    // Поиск по имени
    const matchesSearch = !searchQuery || 
      friend.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Фильтрация по вкладке
    let matchesTab = true;
    if (activeTab === 'online') {
      matchesTab = friend.is_online === 1;
    } else if (activeTab === 'all') {
      matchesTab = true;
    } else if (activeTab === 'pending') {
      matchesTab = false; // Друзья не отображаются во вкладке "Ожидание"
    } else if (activeTab === 'blocked') {
      matchesTab = false; // Друзья не отображаются во вкладке "Заблокированы"
    }
    
    return matchesSearch && matchesTab;
  });
  
  // Фильтрация заявок в друзья по поиску
  $: filteredPendingRequests = pendingIncomingRequests.filter(request => 
    !searchQuery || request.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Фильтрация пользователей для модального окна создания личного чата
  $: modalFilteredUsers = users.filter(user => {
    // Исключаем текущего пользователя из списка
    const isCurrentUser = user.id.toString() === localStorage.getItem('userId');
    if (isCurrentUser) return false;
    
    // Поиск по имени
    return !searchQuery || user.username.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  // Фильтрация личных сообщений по поиску
  $: filteredDirectMessages = directMessages.filter(dm => 
    !searchQuery || dm.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Сортировка личных сообщений: сначала с непрочитанными, потом онлайн, затем по алфавиту
  $: sortedDirectMessages = filteredDirectMessages.sort((a, b) => {
    // Сначала по непрочитанным сообщениям
    if ((a.unreadCount || 0) > 0 && !(b.unreadCount || 0)) return -1;
    if (!(a.unreadCount || 0) && (b.unreadCount || 0) > 0) return 1;
    
    // Затем по статусу онлайн
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    
    // Потом по алфавиту
    return a.username.localeCompare(b.username);
  });
  
  // Проверка доступности сервера
  async function checkServerAvailability() {
    try {
      const response = await fetch('http://localhost:3000/api/health');
      serverAvailable = response.ok;
      
      if (!serverAvailable) {
        showServerStatus = true;
        error = 'Сервер недоступен. Проверьте, запущен ли сервер на localhost:3000';
      } else {
        showServerStatus = false;
      }
      
      return serverAvailable;
    } catch (err) {
      console.error('Сервер недоступен:', err);
      serverAvailable = false;
      showServerStatus = true;
      error = 'Не удалось подключиться к серверу. Убедитесь, что сервер запущен на localhost:3000';
      return false;
    }
  }
  
  // Обработчик статуса сервера
  function handleServerStatusChange(event) {
    const { status } = event.detail;
    serverAvailable = status === 'connected';
    
    if (serverAvailable) {
      showServerStatus = false;
      fetchFriends();
    }
  }
</script>

<div class="discord-layout">
  <!-- Левая колонка с личными сообщениями (видно только когда открыта страница друзей) -->
  <div class="direct-messages-container">
    <div class="dm-header">
      <input 
        class="dm-search" 
        type="text" 
        placeholder="Найти или начать беседу" 
        bind:value={searchQuery}
      />
    </div>
    
    <div class="dm-list">
      <div class="dm-section">
        <button class="dm-item friends-button" on:click={() => activeDirectMessage = null}>
          <div class="dm-icon friends-icon">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path fill="currentColor" d="M9.00002 11.9986C11.2092 11.9986 13.0001 10.2077 13.0001 7.99858C13.0001 5.78947 11.2092 3.99858 9.00002 3.99858C6.79091 3.99858 5.00002 5.78947 5.00002 7.99858C5.00002 10.2077 6.79091 11.9986 9.00002 11.9986ZM9.00002 13.9986C5.42595 13.9986 2.50002 16.9245 2.50002 20.4986C2.50002 21.3306 3.16705 21.9986 4.00002 21.9986H14C14.833 21.9986 15.5 21.3306 15.5 20.4986C15.5 16.9245 12.5741 13.9986 9.00002 13.9986ZM16.25 7.99858C16.25 6.10058 17.102 4.38453 18.4532 3.20488C17.775 3.06958 17.0392 2.99858 16.25 2.99858C12.6759 2.99858 9.75002 5.92451 9.75002 9.49858C9.75002 13.0727 12.6759 15.9986 16.25 15.9986C17.0392 15.9986 17.775 15.9276 18.4532 15.7923C17.102 14.6126 16.25 12.8966 16.25 10.9986V7.99858Z"/>
            </svg>
          </div>
          <div class="dm-name">Друзья</div>
        </button>
      </div>
      
      <div class="dm-section">
        <div class="dm-section-header">
          <span>ЛИЧНЫЕ СООБЩЕНИЯ</span>
          <button 
            class="dm-add-button" 
            on:click={createNewDirectMessage} 
            title="Создать ЛС"
            aria-label="Создать личное сообщение">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z"></path>
            </svg>
          </button>
        </div>
        
        {#if sortedDirectMessages.length === 0}
          <div class="dm-empty">
            {#if searchQuery}
              <p>Ничего не найдено</p>
            {:else}
              <p>У вас пока нет личных сообщений</p>
            {/if}
          </div>
        {:else}
          {#each sortedDirectMessages as dm}
            <button 
              class="dm-item {activeDirectMessage === dm.id ? 'active' : ''}" 
              on:click={() => openDirectMessage(dm.id)}
            >
              <div class="dm-avatar" style="position: relative">
                {dm.avatar}
                {#if dm.isOnline}
                  <span class="status-online"></span>
                {/if}
              </div>
              <div class="dm-info">
                <div class="dm-name">{dm.username}</div>
                {#if dm.lastMessage}
                  <div class="dm-status">{dm.isOnline ? 'В сети' : 'Не в сети'}</div>
                {/if}
              </div>
              {#if dm.unreadCount && dm.unreadCount > 0}
                <div class="dm-unread">{dm.unreadCount}</div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
    
    <!-- Профиль пользователя -->
    <div class="user-profile">
      <div class="user-profile-inner">
        <div class="user-avatar">
          {localStorage.getItem('username') ? localStorage.getItem('username')?.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="user-info">
          <div class="user-name">{localStorage.getItem('username') || 'Пользователь'}</div>
          <div class="user-status">В сети</div>
        </div>
        <div class="user-actions">
          <button 
            class="user-action-button" 
            title="Настройки"
            aria-label="Настройки пользователя">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M19.738 10H22V14H19.739C19.498 14.931 19.1 15.798 18.565 16.564L20 18L18 20L16.565 18.564C15.797 19.099 14.932 19.498 14 19.738V22H10V19.738C9.069 19.498 8.203 19.099 7.436 18.564L6 20L4 18L5.436 16.564C4.901 15.799 4.502 14.932 4.262 14H2V10H4.262C4.502 9.068 4.9 8.202 5.436 7.436L4 6L6 4L7.436 5.436C8.202 4.9 9.068 4.502 10 4.262V2H14V4.261C14.932 4.502 15.797 4.9 16.565 5.435L18 3.999L20 5.999L18.564 7.436C19.099 8.202 19.498 9.069 19.738 10ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Центральное содержимое страницы - список друзей -->
  <div class="friends-container">
    <!-- Верхняя навигация -->
    <div class="friends-top-nav">
      <div class="friends-title">
        <svg width="24" height="24" viewBox="0 0 24 24" class="friends-icon-header">
          <path fill="currentColor" d="M9.00002 11.9986C11.2092 11.9986 13.0001 10.2077 13.0001 7.99858C13.0001 5.78947 11.2092 3.99858 9.00002 3.99858C6.79091 3.99858 5.00002 5.78947 5.00002 7.99858C5.00002 10.2077 6.79091 11.9986 9.00002 11.9986ZM9.00002 13.9986C5.42595 13.9986 2.50002 16.9245 2.50002 20.4986C2.50002 21.3306 3.16705 21.9986 4.00002 21.9986H14C14.833 21.9986 15.5 21.3306 15.5 20.4986C15.5 16.9245 12.5741 13.9986 9.00002 13.9986ZM16.25 7.99858C16.25 6.10058 17.102 4.38453 18.4532 3.20488C17.775 3.06958 17.0392 2.99858 16.25 2.99858C12.6759 2.99858 9.75002 5.92451 9.75002 9.49858C9.75002 13.0727 12.6759 15.9986 16.25 15.9986C17.0392 15.9986 17.775 15.9276 18.4532 15.7923C17.102 14.6126 16.25 12.8966 16.25 10.9986V7.99858Z"/>
        </svg>
        <h2>Друзья</h2>
      </div>
      
      <div class="friends-tabs">
        <button 
          class={`friends-tab ${activeTab === 'all' ? 'active' : ''}`} 
          on:click={() => setActiveTab('all')}
        >
          Все
        </button>
        <button 
          class={`friends-tab ${activeTab === 'online' ? 'active' : ''}`} 
          on:click={() => setActiveTab('online')}
        >
          В сети {onlineCount > 0 ? `(${onlineCount})` : ''}
        </button>
        <button 
          class={`friends-tab ${activeTab === 'pending' ? 'active' : ''}`} 
          on:click={() => setActiveTab('pending')}
        >
          Ожидание {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
        <button 
          class={`friends-tab ${activeTab === 'blocked' ? 'active' : ''}`} 
          on:click={() => setActiveTab('blocked')}
        >
          Заблокированные {blockedCount > 0 ? `(${blockedCount})` : ''}
        </button>
      </div>
      
      <div class="friends-actions">
        <button class="friends-action-button" on:click={createNewDirectMessage}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 11.1111H12.8889V4H11.1111V11.1111H4V12.8889H11.1111V20H12.8889V12.8889H20V11.1111Z"></path>
          </svg>
          Создать ЛС
        </button>
      </div>
    </div>
    
    <!-- Поиск друзей -->
    <div class="friends-search">
      <input 
        type="text" 
        placeholder="Поиск по имени" 
        bind:value={searchQuery} 
        class="friends-search-input"
      />
    </div>
    
    <!-- Список друзей -->
    <div class="friends-list-wrapper">
      {#if loading}
        <div class="friends-loading">
          <div class="loading-spinner"></div>
          <p>Загрузка...</p>
        </div>
      {:else if error}
        <div class="friends-error">
          <p>Произошла ошибка: {error}</p>
          <button class="retry-button" on:click={() => window.location.reload()}>
            Повторить
          </button>
        </div>
      {:else}
        {#if activeTab === 'pending'}
          <!-- Входящие заявки в друзья -->
          <div class="friends-list">
            {#if filteredPendingRequests.length === 0}
              <div class="friends-empty">
                {#if searchQuery}
                  <p>Нет входящих заявок по вашему запросу</p>
                {:else}
                  <p>У вас нет входящих заявок в друзья</p>
                {/if}
              </div>
            {:else}
              <div class="friends-section-header">
                Входящие заявки — {filteredPendingRequests.length}
              </div>
              {#each filteredPendingRequests as request}
                <div class="friend-item">
                  <div class="friend-avatar" style="position: relative">
                    {request.username.charAt(0).toUpperCase()}
                    {#if request.is_online === 1}
                      <span class="status-online"></span>
                    {/if}
                  </div>
                  <div class="friend-info">
                    <div class="friend-name">{request.username}</div>
                    <div class="friend-status">
                      {request.is_online === 1 ? 'В сети' : 'Не в сети'}
                    </div>
                  </div>
                  <div class="friend-actions">
                    <button 
                      class="friend-action-button accept" 
                      on:click={() => acceptFriendRequest(request.id)}
                      title="Принять"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/>
                      </svg>
                    </button>
                    <button 
                      class="friend-action-button decline" 
                      on:click={() => rejectFriendRequest(request.id)}
                      title="Отклонить"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {:else if activeTab === 'blocked'}
          <!-- Заблокированные пользователи (заглушка) -->
          <div class="friends-empty">
            <p>У вас нет заблокированных пользователей</p>
          </div>
        {:else}
          <!-- Список друзей (онлайн или все) -->
          <div class="friends-list">
            {#if filteredFriends.length === 0}
              <div class="friends-empty">
                {#if searchQuery}
                  <p>Нет друзей по вашему запросу</p>
                {:else if activeTab === 'online'}
                  <p>Нет друзей в сети</p>
                {:else}
                  <p>У вас пока нет друзей. Добавьте кого-нибудь в друзья!</p>
                {/if}
              </div>
            {:else}
              <div class="friends-section-header">
                {activeTab === 'online' ? 'В СЕТИ' : 'ВСЕ ДРУЗЬЯ'} — {filteredFriends.length}
              </div>
              {#each filteredFriends as friend}
                <div class="friend-item">
                  <div class="friend-avatar" style="position: relative">
                    {friend.username.charAt(0).toUpperCase()}
                    {#if friend.is_online === 1}
                      <span class="status-online"></span>
                    {/if}
                  </div>
                  <div class="friend-info">
                    <div class="friend-name">{friend.username}</div>
                    <div class="friend-status">
                      {friend.is_online === 1 ? 'В сети' : 'Не в сети'}
                    </div>
                  </div>
                  <div class="friend-actions">
                    <button 
                      class="friend-action-button message" 
                      on:click={() => startChat(friend.id)}
                      title="Сообщение"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z"/>
                      </svg>
                    </button>
                    <button 
                      class="friend-action-button more"
                      title="Дополнительно"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M12 16C13.1 16 14 16.9 14 18S13.1 20 12 20 10 19.1 10 18 10.9 16 12 16ZM12 10C13.1 10 14 10.9 14 12S13.1 14 12 14 10 13.1 10 12 10.9 10 12 10ZM12 4C13.1 4 14 4.9 14 6S13.1 8 12 8 10 7.1 10 6 10.9 4 12 4Z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Модальное окно для создания нового личного сообщения -->
{#if showNewMessageModal}
  <div class="modal-backdrop" on:click={closeNewMessageModal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-container" on:click|stopPropagation>
      <div class="modal-header">
        <h3 id="modal-title">Создать личное сообщение</h3>
        <button class="modal-close" on:click={closeNewMessageModal} aria-label="Закрыть">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="modal-content">
        <div class="modal-search">
          <input 
            type="text" 
            placeholder="Поиск пользователя" 
            bind:value={searchQuery} 
            class="modal-search-input"
          />
        </div>
        <div class="modal-users-list">
          {#if modalFilteredUsers.length === 0}
            <div class="modal-empty">
              {#if searchQuery}
                <p>Пользователей не найдено</p>
              {:else}
                <p>Нет доступных пользователей</p>
              {/if}
            </div>
          {:else}
            {#each modalFilteredUsers as user}
              <button 
                class="modal-user-item {selectedUser?.id === user.id ? 'selected' : ''}" 
                on:click={() => selectUserForDirectMessage(user)}
              >
                <div class="modal-user-avatar" style="position: relative">
                  {user.username.charAt(0).toUpperCase()}
                  {#if user.is_online === 1}
                    <span class="status-online"></span>
                  {/if}
                </div>
                <div class="modal-user-info">
                  <div class="modal-user-name">{user.username}</div>
                  <div class="modal-user-status">
                    {user.is_online === 1 ? 'В сети' : 'Не в сети'}
                    {#if user.friendship_status === 'friends'}
                      • Друг
                    {:else if user.friendship_status === 'pending_outgoing'}
                      • Запрос отправлен
                    {:else if user.friendship_status === 'pending_incoming'}
                      • Входящий запрос
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button 
          class="modal-button cancel" 
          on:click={closeNewMessageModal}
        >
          Отмена
        </button>
        <button 
          class="modal-button confirm" 
          on:click={confirmNewDirectMessage}
          disabled={!selectedUser}
        >
          Создать ЛС
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  .discord-layout {
    display: flex;
    height: 100vh;
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
  }
  
  .direct-messages-container {
    display: flex;
    flex-direction: column;
    width: 240px;
    background-color: var(--color-channel-list);
    height: 100%;
    overflow: hidden;
  }
  
  .dm-header {
    padding: 16px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .dm-search {
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    background-color: var(--color-bg-search);
    border: none;
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }
  
  .dm-search::placeholder {
    color: var(--color-text-placeholder);
  }
  
  .dm-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .dm-section {
    margin-bottom: 16px;
  }
  
  .dm-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    margin-bottom: 4px;
  }
  
  .friends-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 800px;
    margin: 0 auto;
    padding: 0 16px;
    box-sizing: border-box;
    height: 100%;
    overflow: hidden;
  }
  
  .friends-top-nav {
    display: flex;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    gap: 16px;
    flex-wrap: wrap;
  }
  
  .friends-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .friends-title h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .friends-icon-header {
    color: var(--color-primary);
  }
  
  .friends-tabs {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  
  .friends-tab {
    padding: 8px 12px;
    border-radius: 4px;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .friends-tab:hover {
    background-color: rgba(79, 84, 92, 0.3);
    color: var(--color-text-primary);
  }
  
  .friends-tab.active {
    background-color: rgba(56, 189, 248, 0.15);
    color: var(--color-primary);
  }
  
  .friends-actions {
    margin-left: auto;
  }
  
  .friends-action-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 4px;
    background-color: var(--color-accent);
    border: none;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .friends-action-button:hover {
    background-color: var(--color-accent-dark);
  }
  
  .friends-search {
    padding: 16px 0;
  }
  
  .friends-search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    background-color: var(--color-bg-search);
    border: none;
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }
  
  .friends-search-input::placeholder {
    color: var(--color-text-placeholder);
  }
  
  .friends-list-wrapper {
    flex: 1;
    overflow-y: auto;
    padding-right: 4px;
  }
  
  .friends-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .friends-section-header {
    padding: 12px 8px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  
  .friend-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: rgba(15, 23, 42, 0.3);
    transition: all 0.2s ease;
  }
  
  .friend-item:hover {
    background-color: rgba(31, 41, 55, 0.5);
  }
  
  .friend-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    margin-right: 12px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }
  
  .friend-info {
    flex: 1;
  }
  
  .friend-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .friend-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  .friend-actions {
    display: flex;
    gap: 8px;
  }
  
  .friend-action-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(15, 23, 42, 0.5);
    border: none;
    border-radius: 50%;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .friend-action-button:hover {
    color: var(--color-text-primary);
    background-color: rgba(31, 41, 55, 0.7);
  }
  
  .friend-action-button.message:hover {
    color: var(--color-primary);
  }
  
  .friend-action-button.accept {
    color: #10B981;
  }
  
  .friend-action-button.accept:hover {
    background-color: rgba(16, 185, 129, 0.2);
  }
  
  .friend-action-button.decline {
    color: #EF4444;
  }
  
  .friend-action-button.decline:hover {
    background-color: rgba(239, 68, 68, 0.2);
  }
  
  .friends-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
  }
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(79, 84, 92, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-primary);
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .friends-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    text-align: center;
  }
  
  .retry-button {
    margin-top: 16px;
    padding: 8px 16px;
    border-radius: 4px;
    background-color: var(--color-accent);
    border: none;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }
  
  .friends-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-muted);
    text-align: center;
    font-size: 0.95rem;
  }
  
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal-container {
    width: 100%;
    max-width: 480px;
    background-color: var(--color-bg-secondary);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .modal-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  
  .modal-close:hover {
    color: var(--color-text-primary);
  }
  
  .modal-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }
  
  .modal-search {
    margin-bottom: 16px;
  }
  
  .modal-search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    background-color: var(--color-bg-search);
    border: none;
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }
  
  .modal-users-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .modal-user-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-radius: 4px;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .modal-user-item:hover {
    background-color: rgba(79, 84, 92, 0.3);
    color: var(--color-text-primary);
  }
  
  .modal-user-item.selected {
    background-color: rgba(56, 189, 248, 0.15);
    color: var(--color-text-primary);
  }
  
  .modal-user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    margin-right: 12px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }
  
  .modal-user-info {
    flex: 1;
  }
  
  .modal-user-name {
    font-size: 0.9375rem;
    font-weight: 600;
  }
  
  .modal-user-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  .modal-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: var(--color-text-muted);
    text-align: center;
  }
  
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .modal-button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }
  
  .modal-button.cancel {
    background: none;
    border: none;
    color: var (--color-text-secondary);
  }
  
  .modal-button.cancel:hover {
    color: var(--color-text-primary);
  }
  
  .modal-button.confirm {
    background-color: var(--color-accent);
    border: none;
    color: white;
  }
  
  .modal-button.confirm:hover {
    background-color: var(--color-accent-dark);
  }
  
  .modal-button.confirm:disabled {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  
  /* Include the previously shown styles */
  .dm-section-header span {
    color: var(--color-text-muted);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  
  .dm-add-button {
    width: 16px;
    height: 16px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
  }
  
  .dm-section-header:hover .dm-add-button {
    opacity: 1;
  }
  
  .dm-add-button:hover {
    color: var(--color-text-primary);
  }
  
  .dm-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 2px;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .dm-item:hover {
    background: rgba(79, 84, 92, 0.3);
    color: var(--color-text-primary);
  }
  
  .dm-item.active {
    background: rgba(56, 189, 248, 0.15);
    color: var(--color-text-primary);
  }
  
  .dm-avatar {
    width: 32px;
    height: 32px;
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
  
  .dm-icon {
    width: 32px;
    height: 32px;
    margin-right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }
  
  .friends-icon {
    color: var(--color-primary);
  }
  
  .dm-name {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .dm-info {
    flex: 1;
    overflow: hidden;
  }
  
  .dm-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  .dm-unread {
    width: 16px;
    height: 16px;
    background-color: var(--color-primary);
    border-radius: 50%;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dm-empty {
    padding: 16px 8px;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    text-align: center;
  }
  
  .friends-button {
    margin-bottom: 8px;
    background: rgba(56, 189, 248, 0.1);
    border-radius: 4px;
  }
  
  .user-profile {
    padding: 8px;
    margin-top: auto;
    background-color: rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .user-profile-inner {
    display: flex;
    align-items: center;
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    margin-right: 8px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
  }
  
  .user-info {
    flex: 1;
    overflow: hidden;
  }
  
  .user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .user-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  .user-actions {
    display: flex;
  }
  
  .user-action-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .user-action-button:hover {
    color: var(--color-text-primary);
    background-color: rgba(79, 84, 92, 0.3);
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
</style>