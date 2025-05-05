<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import Message from '../components/Message.svelte';
  import UserInput from '../components/UserInput.svelte';

  // Type definitions for window properties
  interface CustomWindow extends Window {
    socketConnections: number;
    lastSocketActivity: number;
  }

  // Use type assertion to access custom window properties (with intermediate unknown conversion)
  const customWindow = window as unknown as CustomWindow;

  const dispatch = createEventDispatcher();

  export let chatId: string;
  
  interface MessageType {
    id?: number | string; // Updated to allow string IDs for pending messages
    chat_id: string;
    user_id: string;
    username: string;
    content: string;
    created_at: string;
    isPending?: boolean; // Flag for optimistic UI updates
    isFailed?: boolean; // Flag for failed message sending
  }
  
  interface ChatInfoType {
    id: number;
    name: string;
    created_at: string;
  }
  
  interface UserType {
    id: number;
    username: string;
    is_online: number;
  }

  interface ServerInfoType {
    server_id: string | number;
    name: string;
  }

  let messages: MessageType[] = [];
  let chatInfo: ChatInfoType | null = null;
  let chatUsers: UserType[] = [];
  let loading: boolean = true;
  let error: string = '';
  let socket: Socket | null = null;
  let userId: string = '';
  let username: string = '';
  let messageInput: string = '';
  let currentChatId: string = '';
  let isSocketConnected: boolean = false;
  let socketInitialized = false; // Flag to track if socket was already initialized
  let statusInterval: number | null = null; // Fixed: Changed ReturnType<typeof setInterval> to number
  let isSending: boolean = false; // Индикатор отправки сообщения
  let sendError: string = ''; // Ошибка отправки сообщения
  
  // Статистика пользователей
  let onlineCount = 0;
  let offlineCount = 0;

  // Функция для обновления токена авторизации при необходимости
  async function refreshAuthToken() {
    try {
      // Получаем текущий токен
      const currentToken = localStorage.getItem('token');
      if (!currentToken) {
        return false;
      }

      // Проверяем валидность токена
      const response = await fetch('http://localhost:3000/api/auth/validate-token', {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      
      const data = await response.json();

      if (!response.ok) {
        // Если токен невалидный, выполняем повторный вход
        console.error('Токен авторизации устарел или недействителен');
        
        // Очищаем данные авторизации
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        
        // Перенаправляем на страницу входа
        dispatch('navigate', '/');
        return false;
      } else {
        // Если токен был обновлен, сохраняем новый токен
        if (data.renewed && data.token) {
          console.log('Токен был обновлен на сервере');
          localStorage.setItem('token', data.token);
        }
        
        // Токен валидный, обнуляем ошибку, если она была связана с авторизацией
        if (error === 'Ошибка авторизации. Проверьте ваши права доступа.') {
          error = '';
        }
        return true;
      }
    } catch (err) {
      console.error('Ошибка при проверке токена авторизации:', err);
      return false;
    }
  }

  // Функция для загрузки данных чата
  async function loadChatData(channelId: string) {
    try {
      // Показываем загрузку и сбрасываем ошибки
      loading = true;
      error = '';
      
      if (currentChatId === channelId) {
        // Если пользователь пытается перейти в канал, в котором он уже находится,
        // просто обновляем данные без переподключения сокета
        console.log('Повторная загрузка того же канала:', channelId);
        await refreshChatData(channelId);
        loading = false;
        return;
      }
      
      // Сохраняем ID нового канала и сбрасываем прежние данные
      const prevChatId = currentChatId;
      currentChatId = channelId;
      messages = [];
      chatInfo = null;
      chatUsers = [];
      
      const token = localStorage.getItem('token');
      const storedUserId = localStorage.getItem('userId');
      
      // Используем userId из компонента или из localStorage
      if (!token || (!userId && !storedUserId)) {
        error = 'Необходима авторизация для доступа к чату. Токен или ID пользователя отсутствуют.';
        console.error('Ошибка авторизации: token =', token, 'userId =', userId, 'localStorage userId =', storedUserId);
        loading = false;
        return;
      }
      
      // Если в компоненте нет userId, но есть в localStorage, используем его
      if (!userId && storedUserId) {
        userId = storedUserId;
        username = localStorage.getItem('username') || '';
        console.log('Используем данные пользователя из localStorage:', userId, username);
      }

      console.log(`Попытка загрузить чат ${channelId} для пользователя ${userId}`);

      // Получаем информацию о чате
      try {
        const chatResponse = await fetch(`http://localhost:3000/api/chats/info/${channelId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log(`Запрос информации о чате ${channelId}: Статус ${chatResponse.status}`);

        if (!chatResponse.ok) {
          const errorData = await chatResponse.text();
          console.error(`Ошибка при получении информации о чате ${channelId}:`, chatResponse.status, errorData);
          
          // Получаем дополнительную информацию о канале через API серверов
          try {
            // Проверка, является ли канал серверным
            const checkServerChannel = await fetch(`http://localhost:3000/api/debug/channel-info/${channelId}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (checkServerChannel.ok) {
              const channelDebugInfo = await checkServerChannel.json();
              console.log('Отладочная информация о канале:', channelDebugInfo);
              
              if (channelDebugInfo.server_id) {
                error = `Ошибка доступа: Канал ${channelId} принадлежит серверу ${channelDebugInfo.server_id}, но у вас нет доступа к этому каналу. Проверьте, являетесь ли вы участником сервера.`;
                loading = false;
                return;
              }
            }
          } catch (debugErr) {
            console.error('Ошибка при получении отладочной информации о канале:', debugErr);
          }
          
          // Попробуем дополнительно проверить, является ли это серверным каналом
          const serverCheckResponse = await fetch(`http://localhost:3000/api/servers`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          let foundInServer = false;
          
          if (serverCheckResponse.ok) {
            const servers = await serverCheckResponse.json();
            console.log('Доступные серверы:', servers);
            
            // Проверяем, относится ли канал к одному из серверов пользователя
            for (const server of servers) {
              // Пробуем получить каналы сервера
              const serverChannelsResponse = await fetch(`http://localhost:3000/api/servers/${server.id}/channels`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (serverChannelsResponse.ok) {
                const channelsData = await serverChannelsResponse.json();
                console.log(`Каналы сервера ${server.id}:`, channelsData);
                
                // Ищем канал с нужным ID среди всех категорий
                for (const category in channelsData) {
                  const foundChannel = channelsData[category].find((channel: { id: number; name: string; created_at: string }) => channel.id.toString() === channelId);
                  if (foundChannel) {
                    // Если нашли канал на сервере - используем его данные
                    chatInfo = {
                      id: foundChannel.id,
                      name: foundChannel.name,
                      created_at: foundChannel.created_at
                    };
                    console.log('Канал найден на сервере:', server.name, chatInfo);
                    foundInServer = true;
                    
                    // Проверяем, является ли пользователь владельцем сервера
                    if (server.owner_id.toString() === userId) {
                      console.log('Вы являетесь владельцем сервера, но не можете получить доступ к каналу. Проверьте права доступа.');
                      error = 'Вы являетесь владельцем сервера, но не можете получить доступ к каналу. Пожалуйста, проверьте настройки сервера.';
                    } else {
                      error = `Канал найден на сервере ${server.name}, но у вас нет доступа к его сообщениям. Проверьте права доступа.`;
                    }
                    
                    // Продолжаем загрузку, но с данными, которые мы нашли
                    break;
                  }
                }
              } else {
                console.error(`Ошибка при получении каналов сервера ${server.id}:`, await serverChannelsResponse.text());
              }
              
              if (foundInServer) break; // Если нашли канал, выходим из цикла серверов
            }
          } else {
            console.error('Ошибка при получении списка серверов:', await serverCheckResponse.text());
          }
          
          // Если мы не нашли канал на серверах или не смогли найти информацию
          if (!foundInServer) {
            error = `Не удалось загрузить информацию о чате. Код ошибки: ${chatResponse.status}. ${errorData}`;
          }
          
          loading = false;
          return;
        }

        chatInfo = await chatResponse.json();
        console.log('Загружена информация о чате:', chatInfo);
      } catch (chatError: unknown) {
        console.error('Ошибка при загрузке информации о чате:', chatError);
        error = chatError instanceof Error 
          ? `Ошибка при загрузке информации о чате: ${chatError.message}` 
          : 'Произошла неизвестная ошибка при загрузке информации о чате';
        loading = false;
        return;
      }
      
      // Получаем пользователей чата
      try {
        const usersResponse = await fetch(`http://localhost:3000/api/chats/${channelId}/users`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log(`Запрос пользователей чата ${channelId}: Статус ${usersResponse.status}`);
        
        if (!usersResponse.ok) {
          const errorData = await usersResponse.text();
          console.error(`Ошибка при получении пользователей чата ${channelId}:`, usersResponse.status, errorData);
          error = `Не удалось загрузить пользователей чата. Код ошибки: ${usersResponse.status}. ${errorData}`;
          loading = false;
          return;
        }
        
        chatUsers = await usersResponse.json();
        console.log('Загружены пользователи чата:', chatUsers);
        
        // Считаем онлайн/оффлайн пользователей
        onlineCount = chatUsers.filter(user => user.is_online === 1).length;
        offlineCount = chatUsers.length - onlineCount;
      } catch (usersError: unknown) {
        console.error('Ошибка при загрузке пользователей чата:', usersError);
        error = usersError instanceof Error 
          ? `Ошибка при загрузке пользователей чата: ${usersError.message}` 
          : 'Произошла неизвестная ошибка при загрузке пользователей чата';
        loading = false;
        return;
      }

      // Получаем историю сообщений
      try {
        const messagesResponse = await fetch(`http://localhost:3000/api/chats/${channelId}/messages`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log(`Запрос сообщений чата ${channelId}: Статус ${messagesResponse.status}`);

        if (!messagesResponse.ok) {
          const errorData = await messagesResponse.text();
          console.error(`Ошибка при получении сообщений чата ${channelId}:`, messagesResponse.status, errorData);
          error = `Не удалось загрузить сообщения чата. Код ошибки: ${messagesResponse.status}. ${errorData}`;
          loading = false;
          return;
        }

        messages = await messagesResponse.json();
        console.log('Загружены сообщения чата:', messages.length);
      } catch (messagesError: unknown) {
        console.error('Ошибка при загрузке сообщений чата:', messagesError);
        error = messagesError instanceof Error 
          ? `Ошибка при загрузке сообщений чата: ${messagesError.message}` 
          : 'Произошла неизвестная ошибка при загрузке сообщений чата';
        loading = false;
        return;
      }
      
      // При смене чата отключаемся от предыдущей комнаты и подключаемся к новой
      // Но только если сокет существует и подключен
      if (socket && isSocketConnected) {
        if (prevChatId) {
          socket.emit('leaveChat', prevChatId);
        }
        socket.emit('joinChat', channelId);
      }

    } catch (err) {
      console.error('Общая ошибка при загрузке чата:', err);
      error = err instanceof Error 
        ? `Произошла ошибка при загрузке чата: ${err.message}` 
        : 'Произошла неизвестная ошибка при загрузке чата';
    } finally {
      loading = false;
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }
  
  // Функция для обновления данных текущего чата без полной перезагрузки
  async function refreshChatData(channelId: string) {
    try {
      const token = localStorage.getItem('token');
      
      if (!token || !userId) {
        console.log('refreshChatData: Отсутствует токен или ID пользователя');
        return;
      }

      console.log('Обновление данных чата:', channelId);
      
      // Получаем пользователей чата (обновляем только их)
      const usersResponse = await fetch(`http://localhost:3000/api/chats/${channelId}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!usersResponse.ok) {
        console.error(`Ошибка при обновлении пользователей чата (код ${usersResponse.status})`);
        
        // Проверяем, если ошибка авторизации, не показываем ошибку сразу
        if (usersResponse.status === 401 || usersResponse.status === 403) {
          console.log('Ошибка авторизации при обновлении данных. Попробуем еще раз позже.');
          return; // Молча выходим, не обновляя ошибку
        }
        
        // Для других ошибок создаем исключение
        throw new Error('Не удалось обновить список пользователей чата');
      }
      
      chatUsers = await usersResponse.json();
      
      // Считаем онлайн/оффлайн пользователей
      onlineCount = chatUsers.filter(user => user.is_online === 1).length;
      offlineCount = chatUsers.length - onlineCount;

    } catch (err) {
      // Ошибки тихо логируем, но не показываем пользователю
      console.error('Ошибка при обновлении данных чата:', err);
    }
  }
  
  // Функция для прокрутки к последнему сообщению
  function scrollToBottom() {
    const messageContainer = document.querySelector('.chat-content');
    if (messageContainer) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  // Инициализация Socket.IO соединения
  function initializeSocket() {
    // Если сокет уже инициализирован и подключен, используем его
    if (socket && socketInitialized) {
      console.log('Socket.IO соединение уже существует, переиспользуем его');
      return socket;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('Token not found. Cannot initialize socket connection.');
      return null;
    }
    
    console.log('Инициализация Socket.IO соединения');
    
    // Инициализируем счетчик соединений, если он еще не создан
    if (typeof customWindow.socketConnections === 'undefined') {
      customWindow.socketConnections = 0;
    }
    
    // Инициализируем timestamp последней активности
    customWindow.lastSocketActivity = Date.now();
    
    // Настраиваем Socket.IO с опциями для стабильного соединения
    const socketInstance = io('http://localhost:3000', {
      auth: { token }, // Correct way to pass the token
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true, // Changed to true to connect automatically
      forceNew: false, // Избегаем создания нового соединения каждый раз
      transports: ['websocket']  // Используем только websocket для стабильности
    });
    
    // Сохраняем сокет в глобальной области видимости
    customWindow.globalSocket = socketInstance;
    
    // Устанавливаем счетчик соединений в 1 при первом создании
    customWindow.socketConnections = 1;
    console.log(`Активных подключений к сокету: ${customWindow.socketConnections}`);
    
    // Обработчик успешного соединения
    socketInstance.on('connect', () => {
      console.log('Socket.IO соединение установлено, ID:', socketInstance.id);
      isSocketConnected = true;
      socketInitialized = true;
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
      
      // Если у нас уже есть текущий chatId, подключаемся к нему
      if (currentChatId) {
        socketInstance.emit('joinChat', currentChatId);
      }
    });
    
    // Обработчик переподключения
    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`Socket.IO переподключен после ${attemptNumber} попыток`);
      isSocketConnected = true;
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
      
      // Переподключаемся к текущему чату
      if (currentChatId) {
        socketInstance.emit('joinChat', currentChatId);
      }
    });
    
    // Обработчик ошибки соединения
    socketInstance.on('connect_error', (error) => {
      console.error('Socket.IO ошибка соединения:', error.message);
      isSocketConnected = false;
    });
    
    // Обработчик разрыва соединения
    socketInstance.on('disconnect', (reason) => {
      console.log('Socket.IO соединение разорвано:', reason);
      isSocketConnected = false;
    });
    
    // Слушаем новые сообщения
    socketInstance.on('newMessage', (message: MessageType) => {
      if (message.chat_id === currentChatId) {
        messages = [...messages, message];
        // Обновляем timestamp активности
        customWindow.lastSocketActivity = Date.now();
        setTimeout(() => {
          scrollToBottom();
        }, 50);
      }
    });
    
    // Слушаем обновление статусов пользователей
    socketInstance.on('userStatusChanged', (data: { userId: number, isOnline: boolean, username: string }) => {
      console.log('Пользователь изменил статус:', data);
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
      
      // Проверяем, есть ли пользователь в списке участников чата
      const userExists = chatUsers.some(user => user.id === data.userId);
      
      if (userExists) {
        // Обновляем статус существующего пользователя
        chatUsers = chatUsers.map(user => {
          if (user.id === data.userId) {
            return { ...user, is_online: data.isOnline ? 1 : 0 };
          }
          return user;
        });
      } else {
        // Если пользователя нет в списке, но он подключился к чату, добавляем его
        if (data.isOnline) {
          chatUsers = [...chatUsers, {
            id: data.userId,
            username: data.username,
            is_online: 1
          }];
        }
      }
      
      // Пересчитываем статистику
      onlineCount = chatUsers.filter(user => user.is_online === 1).length;
      offlineCount = chatUsers.length - onlineCount;
    });
    
    // Слушаем событие удаления пользователя из сервера
    socketInstance.on('memberRemoved', (data: { userId: number, username: string, serverId: string, channelId: string }) => {
      console.log('Пользователь удален из сервера:', data);
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
      
      // Удаляем пользователя из списка участников чата, если это текущий чат
      if (data.channelId === currentChatId) {
        chatUsers = chatUsers.filter(user => user.id !== data.userId);
        
        // Пересчитываем статистику
        onlineCount = chatUsers.filter(user => user.is_online === 1).length;
        offlineCount = chatUsers.length - onlineCount;
      }
    });
    
    // Слушаем событие отзыва доступа к серверу (для самого удаленного пользователя)
    socketInstance.on('serverAccessRevoked', (data: { userId: number, serverId: string }) => {
      console.log('Доступ к серверу отозван:', data);
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
      
      // Проверяем, относится ли это к текущему пользователю
      const currentUserId = Number(userId);
      if (data.userId === currentUserId) {
        // Показываем сообщение об ошибке, если мы находимся в чате этого сервера
        // Для этого нужно проверить, принадлежит ли текущий чат указанному серверу
        if (currentChatId) {
          // Проверяем, принадлежит ли текущий чат этому серверу
          const db = getDb();
          
          // Загружаем информацию о чате для проверки принадлежности серверу
          fetchChatServerInfo(currentChatId).then(serverInfo => {
            if (serverInfo && serverInfo.server_id.toString() === data.serverId) {
              console.log('Вы были удалены из сервера, к которому принадлежит текущий чат');
              error = 'Вы были удалены из сервера. Доступ к этому чату больше недоступен.';
              
              // Перенаправляем пользователя на главную страницу через 3 секунды
              setTimeout(() => {
                dispatch('navigate', '/home');
              }, 3000);
            }
          }).catch(err => {
            console.error('Ошибка при проверке принадлежности чата серверу:', err);
          });
        }
      }
    });
    
    // Вспомогательная функция для получения информации о чате и его сервере
    async function fetchChatServerInfo(chatId: string) {
      try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        const response = await fetch(`http://localhost:3000/api/chats/server-info/${chatId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) return null;
        
        return await response.json();
      } catch (error) {
        console.error('Ошибка при получении информации о чате:', error);
        return null;
      }
    }
    
    // Создаем интервал для проверки наличия пользователей в сети
    // и обновления их статусов каждые 60 секунд (увеличено с 30 до 60 секунд)
    if (!statusInterval) {
      statusInterval = window.setInterval(() => {
        // Проверяем активность сокета, если последняя активность была более 5 минут назад,
        // и соединение всё ещё активно, отправляем пинг для проверки связи
        const now = Date.now();
        const lastActivity = customWindow.lastSocketActivity || now;
        const timeSinceLastActivity = now - lastActivity;
        
        if (timeSinceLastActivity > 300000 && socketInstance.connected) { // 5 минут
          console.log('Проверяю активность соединения после долгого простоя');
          socketInstance.emit('ping');
        }
        
        // Обновляем данные о статусах пользователей только если пользователь активно смотрит чат
        // и соединение активно
        if (currentChatId && isSocketConnected && document.visibilityState === 'visible') {
          console.log(`Плановое обновление данных о пользователях для чата ${currentChatId}`);
          refreshChatData(currentChatId);
        }
        
        // Обновляем timestamp активности
        customWindow.lastSocketActivity = now;
      }, 60000); // Увеличено до 60 секунд для снижения нагрузки на сервер
    }
    
    // Вручную подключаемся
    socketInstance.connect();
    
    return socketInstance;
  }

  // Наблюдаем за изменением chatId
  $: {
    if (chatId && chatId !== currentChatId) {
      console.log('chatId изменился на:', chatId);
      // Предотвращаем многократную загрузку
      loadChatData(chatId);
    }
  }

  onMount(async () => {
    // Показываем загрузку пока идет инициализация
    loading = true;
    
    // Получаем данные о текущем пользователе
    const token = localStorage.getItem('token');
    
    if (!token) {
      error = 'Необходима авторизация для доступа к чату.';
      loading = false;
      return;
    }
    
    // Добавляем задержку перед запросом данных пользователя
    // для обеспечения корректной последовательности загрузки
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      console.log('Выполняется запрос данных пользователя...');
      const userResponse = await fetch('http://localhost:3000/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!userResponse.ok) {
        if (userResponse.status === 401) {
          error = 'Ваша сессия истекла. Пожалуйста, войдите снова.';
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          localStorage.removeItem('username');
          dispatch('navigate', '/');
        } else {
          error = 'Ошибка авторизации. Проверьте ваши права доступа.';
        }
        loading = false;
        return;
      }
      
      const userData = await userResponse.json();
      userId = userData.id.toString();
      username = userData.username;
      
      console.log('Получены данные пользователя:', userId, username);
      
      // Сохраняем ID пользователя и имя, если их нет в localStorage
      if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', userId);
      }
      
      if (!localStorage.getItem('username')) {
        localStorage.setItem('username', username);
      }
      
      // Инициализируем Socket.IO соединение только если у нас есть валидный пользователь
      // и если соединение еще не инициализировано
      if (userId && !socketInitialized) {
        socket = initializeSocket();
        
        // Даем небольшую задержку для установки соединения
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Загружаем чат после инициализации пользователя и сокета
      if (chatId) {
        await loadChatData(chatId);
      } else {
        loading = false;
        error = 'Канал не найден';
      }
      
    } catch (err) {
      console.error('Ошибка при загрузке данных пользователя:', err);
      error = err instanceof Error 
        ? `Не удалось загрузить данные пользователя: ${err.message}` 
        : 'Не удалось загрузить данные пользователя. Проверьте подключение к сети.';
      loading = false;
    }
  });

  // Очистка ресурсов при уничтожении компонента
  onDestroy(() => {
    console.log('Chat компонент уничтожается, выполняю очистку');
    
    // Отменяем интервал статусов пользователей
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
    
    // Уменьшаем счетчик активных соединений
    if (customWindow.socketConnections) {
      customWindow.socketConnections -= 1;
      console.log(`Оставшихся активных соединений: ${customWindow.socketConnections}`);
      
      // Только если это последнее активное соединение, отключаем сокет
      if (customWindow.socketConnections <= 0) {
        console.log('Это последнее активное соединение, отключаю Socket.IO');
        
        if (socket) {
          // Отписываемся от всех событий перед отключением
          socket.off('connect');
          socket.off('reconnect');
          socket.off('connect_error');
          socket.off('disconnect');
          socket.off('newMessage');
          socket.off('userStatusChanged');
          
          // Покидаем текущий чат, если он есть
          if (currentChatId) {
            socket.emit('leaveChat', currentChatId);
          }
          
          // Отключаем соединение
          socket.disconnect();
          
          // Сбрасываем глобальные переменные
          customWindow.globalSocket = null;
          customWindow.socketConnections = 0;
          customWindow.lastSocketActivity = 0;
          socketInitialized = false;
          isSocketConnected = false;
        }
      } else {
        console.log('Есть другие активные компоненты, использующие сокет, сохраняю соединение');
        
        // Отписываемся только от событий, относящихся к этому компоненту
        if (socket) {
          // Просто покидаем текущий чат, но сохраняем соединение
          if (currentChatId) {
            socket.emit('leaveChat', currentChatId);
          }
          
          // Отписываемся от слушателей сообщений, относящихся к этому компоненту
          socket.off('newMessage');
        }
      }
    }
    
    // Отменяем интервал статусов пользователей
    if (statusInterval) {
      clearInterval(statusInterval);
    }
  });

  function handleSendMessage() {
    if (!messageInput.trim()) {
      // Нечего отправлять
      return;
    }
    
    // Показываем индикатор отправки
    isSending = true;
    
    const messageData: MessageType = {
      chat_id: currentChatId,
      user_id: userId,
      username: username,
      content: messageInput.trim(),
      created_at: new Date().toISOString()
    };
    
    // Оптимистичное обновление UI - добавляем сообщение сразу
    const pendingMessage: MessageType = {
      ...messageData,
      id: `pending-${Date.now()}`, // Временный ID
      isPending: true // Флаг для стилизации
    };
    
    messages = [...messages, pendingMessage];
    
    // Прокручиваем вниз сразу после добавления сообщения
    setTimeout(() => scrollToBottom(), 50);
    
    // Сохраняем введенное сообщение и очищаем поле ввода
    const currentInput = messageInput;
    messageInput = '';
    
    // Проверяем, есть ли соединение через сокет
    if (socket && isSocketConnected) {
      // Отправляем сообщение через сокет, если соединение активно
      socket.emit('sendMessage', messageData, (response: { error?: string; success?: boolean; messageId?: number }) => {
        isSending = false;
        
        if (response && response.error) {
          // Если получили ошибку через сокет, пробуем отправить через HTTP
          sendMessageHttp(messageData, pendingMessage.id);
        } else {
          // Удаляем временное сообщение, если сервер подтвердил отправку
          if (response && response.success) {
            messages = messages.filter(m => m.id !== pendingMessage.id);
          }
        }
      });
      
      // Обновляем timestamp активности
      customWindow.lastSocketActivity = Date.now();
    } else {
      // Если соединение отсутствует, используем HTTP API
      sendMessageHttp(messageData, pendingMessage.id);
    }
  }

  // Функция для отправки сообщений через HTTP API (резервный метод)
  async function sendMessageHttp(messageData: MessageType, pendingId: string | number) {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Токен авторизации отсутствует');
      }
      
      const response = await fetch(`http://localhost:3000/api/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(messageData)
      });
      
      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        // Только если ответ действительно в формате JSON, парсим его
        data = await response.json();
      } else {
        // Иначе получаем текст ответа
        const textResponse = await response.text();
        console.error('Получен неверный формат ответа:', textResponse);
        data = { 
          message: 'Сервер вернул ответ в неверном формате. Проверьте подключение к серверу.' 
        };
      }
      
      isSending = false;
      
      if (!response.ok) {
        // В случае ошибки HTTP запроса сохраняем сообщение локально,
        // но помечаем его как неотправленное
        messages = messages.map(m => {
          if (m.id === pendingId) {
            return { ...m, isFailed: true, isPending: false };
          }
          return m;
        });
        
        sendError = data.message || 'Не удалось отправить сообщение';
        setTimeout(() => { sendError = ''; }, 3000);
      } else {
        // Успешная отправка - обновляем ID сообщения
        messages = messages.map(m => {
          if (m.id === pendingId) {
            return { 
              ...m, 
              id: data.id, 
              isPending: false,
              created_at: data.created_at || m.created_at
            };
          }
          return m;
        });
      }
    } catch (error) {
      isSending = false;
      console.error('Ошибка при отправке сообщения через HTTP:', error);
      
      // Помечаем сообщение как не отправленное, но оставляем его в чате
      messages = messages.map(m => {
        if (m.id === pendingId) {
          return { ...m, isFailed: true, isPending: false };
        }
        return m;
      });
      
      sendError = error instanceof Error ? error.message : 'Ошибка отправки сообщения';
      setTimeout(() => { sendError = ''; }, 3000);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }
  
  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
</script>

<div class="main-content">
  <!-- Верхняя панель чата -->
  <div class="chat-header">
    <div class="chat-header-left">
      <span class="chat-header-hash">#</span>
      {#if chatInfo}
        <span class="chat-header-title">{chatInfo.name}</span>
      {:else}
        <span class="chat-header-title">Загрузка...</span>
      {/if}
    </div>
    
    <div class="chat-header-right">
      <div class="header-icon">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M21.7 13.35L20.7 14.35L18.65 12.35L19.65 11.35C19.86 11.14 20.21 11.14 20.42 11.35L21.7 12.63C21.91 12.84 21.91 13.19 21.7 13.4V13.35Z"></path>
          <path fill="currentColor" d="M12 18.94L18.06 12.88L20.11 14.93L14.06 20.98C13.95 21.09 13.8 21.16 13.64 21.18L11 21.5L11.32 18.86C11.34 18.7 11.41 18.55 11.52 18.44L11.53 18.43L12 18.94Z"></path>
        </svg>
      </div>
      <div class="header-icon">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22 12L12.101 2.10101L10.686 3.51401L12.101 4.92901L7.15096 9.87801V9.88001L5.73596 8.46501L4.32196 9.88001L8.56496 14.122L2.90796 19.778L4.32196 21.192L9.97896 15.536L14.222 19.778L15.636 18.364L14.222 16.95L19.171 12H19.172L20.586 13.414L22 12Z"></path>
        </svg>
      </div>
      <div class="header-icon">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM12 18.25C11.31 18.25 10.75 17.691 10.75 17C10.75 16.31 11.31 15.75 12 15.75C12.69 15.75 13.25 16.31 13.25 17C13.25 17.691 12.69 18.25 12 18.25ZM13 13.875В"></path>
        </svg>
      </div>
      <div class="header-icon">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M16.886 7.999H20C21.104 7.999 22 8.896 22 9.999V11.999H2V9.999C2 8.896 2.897 7.999 4 7.999H7.114C6.663 7.764 6.236 7.477 5.879 7.121C4.709 5.951 4.709 4.048 5.879 2.879C7.012 1.746 8.986 1.746 10.121 2.877C11.758 4.514 11.979 7.595 11.998 7.941C11.9991 7.9525 11.9966 7.96279 11.9941 7.97304C11.992 7.98151 11.99 7.98995 11.99 7.999H12.01C12.01 7.98986 12.0079 7.98134 12.0058 7.97287C12.0034 7.96282 12.0009 7.95286 12.002 7.942C12.022 7.596 12.242 4.515 13.879 2.878C15.014 1.745 16.986 1.746 18.121 2.877C19.29 4.049 19.29 5.952 18.121 7.121C17.764 7.477 17.337 7.764 16.886 7.999ZM7.293 5.707C6.903 5.316 6.903 4.682 7.293 4.292C7.481 4.103 7.732 4 8 4C8.268 4 8.519 4.103 8.707 4.292C9.297 4.882 9.641 5.94 9.825 6.822C8.945 6.639 7.879 6.293 7.293 5.707ZM14.174 6.824C14.359 5.941 14.702 4.883 15.293 4.293C15.481 4.103 15.732 4 16 4C16.268 4 16.519 4.103 16.706 4.291C17.096 4.682 17.097 5.316 16.707 5.707C16.116 6.298 15.057 6.642 14.174 6.824ZM3 13.999В"></path>
        </svg>
      </div>
    </div>
  </div>

  <!-- Область контента с чатом и списком участников -->
  <div class="chat-content-wrapper">
    <!-- Область чата -->
    <div class="chat-content">
      {#if loading}
        <div class="loading-container">
          <span class="loading-spinner"></span>
        </div>
      {:else if error}
        <div class="error-container">
          <div class="error-message">
            <p>{error}</p>
            <button class="btn-primary" on:click={() => dispatch('navigate', '/home')}>
              Вернуться на главную
            </button>
          </div>
        </div>
      {:else}
        {#if messages.length === 0}
          <div class="welcome-message">
            <div class="welcome-header">
              <div class="welcome-icon">
                <span class="chat-header-hash">#</span>
              </div>
              <h2>Добро пожаловать в канал #{chatInfo?.name}!</h2>
            </div>
            <!-- Изменяем приветственное сообщение в зависимости от типа канала -->
            {#if chatInfo?.name === 'started'}
              <p>Это начало канала сервера. Здесь обычно обсуждаются основные темы и важные объявления.</p>
            {:else}
              <p>Это начало канала #{chatInfo?.name}. Отправьте сообщение, чтобы начать общение.</p>
            {/if}
          </div>
        {:else}
          {#each messages as message, i (message.id)}
            {@const prevMessage = i > 0 ? messages[i-1] : null}
            {@const showHeader = !prevMessage || prevMessage.user_id !== message.user_id || (new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 5 * 60 * 1000)}
            
            {#if showHeader}
              <div class="message-group">
                <div class="message-avatar">
                  {message.username.charAt(0).toUpperCase()}
                </div>
                <div class="message-content">
                  <div class="message-header">
                    <span class="message-author">{message.username}</span>
                    <span class="message-timestamp">{formatTimestamp(message.created_at)}</span>
                  </div>
                  <div class="message-text">{message.content}</div>
                </div>
              </div>
            {:else}
              <div class="message-group-continued">
                <div class="message-timestamp-hover">{formatTimestamp(message.created_at)}</div>
                <div class="message-content">
                  <div class="message-text">{message.content}</div>
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Список пользователей (правая колонка) -->
    <div class="member-list">
      {#if loading}
        <div class="loading-container-small">
          <span class="loading-spinner"></span>
        </div>
      {:else if error}
        <div class="error-container-small">
          <p>{error}</p>
        </div>
      {:else}
        <!-- Пользователи онлайн -->
        <div class="member-group-title">В сети — {onlineCount}</div>
        {#each chatUsers.filter(user => user.is_online === 1) as user}
          <div class="member-item">
            <div class="member-avatar" style="position: relative">
              {user.username.charAt(0).toUpperCase()}
              <span class="status-online"></span>
            </div>
            <div class="member-name">{user.username}</div>
          </div>
        {/each}
        
        <!-- Пользователи оффлайн -->
        {#if offlineCount > 0}
          <div class="member-group-title">Не в сети — {offlineCount}</div>
          {#each chatUsers.filter(user => user.is_online === 0) as user}
            <div class="member-item">
              <div class="member-avatar">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div class="member-name">{user.username}</div>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>

  <!-- Поле ввода -->
  <div class="chat-input-container">
    <div class="chat-input-form">
      <button class="chat-input-button" aria-label="Add attachment">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2.00098C6.486 2.00098 2 6.48698 2 12.001C2 17.515 6.486 22.001 12 22.001C17.514 22.001 22 17.515 22 12.001C22 6.48698 17.514 2.00098 12 2.00098ZM17 13.001H13V17.001H11V13.001H7V11.001H11V7.00098H13V11.001H17V13.001З"></path>
        </svg>
      </button>
      <input 
        type="text" 
        bind:value={messageInput}
        on:keydown={handleKeydown}
        class="chat-input" 
        placeholder={`Сообщение в #${chatInfo?.name || 'общее'}`}
        disabled={isSending}
      />
      
      {#if sendError}
        <div class="send-error">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#f04747" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>{sendError}</span>
        </div>
      {/if}
      
      <button 
        class="chat-input-button send-button" 
        aria-label="Send message"
        on:click={handleSendMessage}
        disabled={isSending || !messageInput.trim() || !isSocketConnected}
      >
        {#if isSending}
          <span class="loading-spinner-small"></span>
        {:else}
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  /* Структура макета */
  .main-content {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden; /* Предотвращаем горизонтальную прокрутку всего приложения */
  }
  
  .chat-content-wrapper {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  
  .chat-header {
    height: var(--header-height);
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 1px 0 rgba(4, 4, 5, 0.2);
    z-index: 10;
    background-color: var(--color-background);
    flex-shrink: 0;
  }
  
  .chat-content {
    flex: 1;
    height: 100%;
    overflow-y: auto;
    padding: 16px;
    padding-right: calc(var(--members-list-width) + 16px); /* Отступ для учета списка участников */
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%; /* Занимает всю доступную ширину */
  }
  
  .member-list {
    width: var(--members-list-width);
    height: 100%; /* Исправление высоты */
    overflow-y: auto;
    background-color: var(--color-channel-list);
    padding: 16px 8px 8px;
    flex-shrink: 0;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    max-width: 240px; /* Максимальная ширина для списка пользователей */
    box-sizing: border-box; /* Чтобы padding не увеличивал ширину */
  }
  
  .chat-input-container {
    padding: 0 16px 24px;
    background-color: var(--color-background);
    flex-shrink: 0;
    padding-right: calc(var(--members-list-width) + 16px);
    position: relative;
    z-index: 0;
    width: 100%;
    box-sizing: border-box;
  }
  
  /* Стили сообщений с ограничением ширины */
  .message-group {
    display: flex;
    margin: 16px 0 4px;
    position: relative;
    width: 100%;
    max-width: calc(100% - var(--members-list-width)); /* Ограничиваем максимальную ширину группы сообщений */
  }
  
  .message-group-continued {
    display: flex;
    margin: 2px 0;
    padding: 2px 0;
    position: relative;
    padding-left: 56px; /* Выравнивание по тексту первого сообщения */
    width: 100%;
    max-width: calc(100% - var(--members-list-width)); /* Ограничиваем максимальную ширину группы сообщений */
  }
  
  .message-content {
    flex: 1;
    min-width: 0; /* Важно! Позволяет flex-элементу сжиматься меньше ширины контента */
    overflow-wrap: break-word; /* Перенос длинных слов */
    word-wrap: break-word;
    word-break: break-word; /* Разрешает перенос слов */
    hyphens: auto; /* Автоматические переносы */
  }
  
  .message-text {
    white-space: pre-wrap; /* Сохраняет пробелы и переносы строк, но разрешает перенос текста */
    overflow-wrap: break-word;
    word-wrap: break-word;
    word-break: break-word;
    max-width: 100%; /* Максимальная ширина текста сообщения */
    font-size: 1rem;
    line-height: 1.375rem;
    color: var(--color-text-primary);
  }
  
  .message-timestamp-hover {
    position: absolute;
    left: -70px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    opacity: 0;
    transition: opacity 0.1s ease;
    text-align: right;
    width: 60px;
    top: 2px;
  }
  
  .message-group-continued:hover .message-timestamp-hover {
    opacity: 1;
  }
  
  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    margin-right: 16px;
    flex-shrink: 0;
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
  }
  
  .loading-container-small {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }
  
  .error-container-small {
    padding: 16px;
    color: #f04747;
    font-size: 0.875rem;
  }
  
  .welcome-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    text-align: center;
  }
  
  .welcome-header {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }
  
  .welcome-icon {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
  }
  
  .welcome-icon .chat-header-hash {
    font-size: 42px;
    color: white;
  }
  
  .chat-input-form {
    background-color: var(--color-input-background);
    border-radius: 8px;
    padding: 0 16px;
    min-height: var(--input-height);
    display: flex;
    align-items: center;
  }
  
  .chat-input {
    flex-grow: 1;
    padding: 12px 0;
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: 0.9375rem;
  }
  
  .chat-input:focus {
    outline: none;
  }
  
  .chat-input-button {
    color: var(--color-text-muted);
    margin: 0 8px;
    cursor: pointer;
  }
  
  .chat-input-button:hover {
    color: var(--color-text-primary);
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
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 2px;
    width: 100%;
  }
  
  .member-item:hover {
    background-color: var(--color-channel-hover);
  }
  
  .member-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    margin-right: 12px;
    background-color: #7289da;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }
  
  .member-name {
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 44px); /* Учитываем ширину аватара и отступы */
  }
  
  .status-online {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #3ba55d;
    position: absolute;
    bottom: 0;
    right: 0;
    border: 2px solid var(--color-channel-list);
  }
  
  .send-button {
    color: var(--color-primary);
    transition: all 0.2s;
  }
  
  .send-button:hover:not(:disabled) {
    color: var(--color-primary-hover);
    transform: scale(1.1);
  }
  
  .send-button:disabled {
    color: var(--color-primary-disabled);
    cursor: not-allowed;
  }
  
  .loading-spinner-small {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(114, 137, 218, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-primary);
    animation: spin 1s ease-in-out infinite;
  }
  
  .send-error {
    position: absolute;
    bottom: 60px;
    left: 16px;
    right: calc(var(--members-list-width) + 16px);
    background-color: rgba(240, 71, 71, 0.1);
    color: #f04747;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 10;
    animation: fadeIn 0.3s;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>