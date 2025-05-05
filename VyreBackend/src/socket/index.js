const { Server } = require('socket.io');
const { server } = require('../../server'); // Импорт HTTP сервера
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

// JWT секрет, должен совпадать с секретом в auth middleware
const JWT_SECRET = process.env.JWT_SECRET || 'vyre-secret-key';

// Инициализация Socket.IO сервера
const io = new Server(server, {
    cors: {
        origin: "*", // Разрешить соединения с любого источника (для разработки)
        methods: ["GET", "POST"]
    },
    // Улучшенные настройки для стабильного соединения
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 10000,
    transports: ['websocket', 'polling'],
    // Предотвращаем быстрые повторные подключения
    reconnectionDelayMax: 10000,
    reconnectionDelay: 3000
});

// Хранение активных подключений по пользователю
const activeConnections = new Map(); // userId -> array of socket ids
// Хранение текущего чата пользователя
const userCurrentChats = new Map(); // userId -> chatId

// Дебаунс функция для устранения частого переключения статусов
const debounceTimers = new Map(); // userId -> timer
function debounceStatusUpdate(userId, isOnline, timeout = 5000) {
    // Отменяем предыдущий таймер, если он существует
    if (debounceTimers.has(userId)) {
        clearTimeout(debounceTimers.get(userId));
    }
    
    // Создаем новый таймер
    const timer = setTimeout(() => {
        updateUserStatus(userId, isOnline);
        
        // Уведомляем о смене статуса
        const user = getUserById(userId);
        if (user) {
            io.emit('userStatusChanged', { 
                userId: parseInt(userId), 
                isOnline: isOnline,
                username: user.username 
            });
        }
        
        debounceTimers.delete(userId);
    }, timeout);
    
    debounceTimers.set(userId, timer);
}

// Кэш пользователей для быстрого получения данных
const userCache = new Map(); // userId -> user data

// Получение данных пользователя
function getUserById(userId) {
    if (userCache.has(userId)) {
        return userCache.get(userId);
    }
    
    // Если пользователя нет в кэше, попробуем получить из БД
    const db = getDb();
    return new Promise((resolve, reject) => {
        db.get('SELECT id, username FROM users WHERE id = ?', [userId], (err, user) => {
            if (err || !user) {
                console.error('Ошибка при получении пользователя из БД:', err);
                resolve(null);
                return;
            }
            
            // Кэшируем пользователя
            userCache.set(userId, user);
            resolve(user);
        });
    });
}

// Middleware для проверки аутентификации в Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        console.error('Соединение без токена отклонено');
        return next(new Error('Аутентификация не выполнена'));
    }
    
    try {
        // Проверяем JWT токен
        const user = jwt.verify(token, JWT_SECRET);
        
        // Сохраняем информацию о пользователе в объекте сокета
        socket.user = user;
        
        // Кэшируем данные пользователя
        if (!userCache.has(user.userId)) {
            userCache.set(user.userId, {
                id: user.userId,
                username: user.username
            });
        }
        
        console.log(`Успешная аутентификация пользователя: ${user.username} (${user.userId})`);
        next();
    } catch (error) {
        console.error('Ошибка аутентификации сокета:', error.message);
        return next(new Error('Недействительный токен'));
    }
});

// Обработка новых подключений
io.on('connection', (socket) => {
    if (!socket.user || !socket.user.userId) {
        console.error('Пользователь без ID попытался подключиться');
        socket.disconnect();
        return;
    }
    
    const userId = socket.user.userId;
    
    console.log(`Новый пользователь подключен: ${socket.id} user: ${socket.user.username}`);

    // Проверка корректности токена и данных пользователя
    try {
        if (!socket.user.username) {
            throw new Error('Имя пользователя отсутствует');
        }
        
        // Дополнительная проверка в БД
        const db = getDb();
        db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Ошибка при проверке пользователя в БД:', err.message);
                return;
            }
            
            if (!user) {
                console.error(`Пользователь с ID ${userId} не найден в базе данных`);
                socket.disconnect();
                return;
            }
            
            console.log(`Пользователь ${socket.user.username} (ID: ${userId}) подтвержден в БД`);
        });
    } catch (error) {
        console.error(`Ошибка при проверке пользователя (${userId}):`, error);
        socket.disconnect();
        return;
    }

    // Отслеживаем подключения пользователя
    if (!activeConnections.has(userId)) {
        activeConnections.set(userId, []);
        
        // Обновляем статус только когда первое соединение устанавливается
        // Используем дебаунс для предотвращения частых обновлений
        debounceStatusUpdate(userId, true, 2000);
    }
    
    // Добавляем сокет в список активных соединений пользователя
    activeConnections.get(userId).push(socket.id);
    console.log(`Активные соединения для ${socket.user.username}: ${activeConnections.get(userId).length}`);

    // При переподключении сразу присоединяем пользователя к его прошлому чату
    if (userCurrentChats.has(userId)) {
        const savedChatId = userCurrentChats.get(userId);
        socket.join(`chat_${savedChatId}`);
        console.log(`Восстановление сессии: User ${userId} (${socket.user.username}) automatically rejoined chat ${savedChatId}`);
    }

    // Обработчик пинга для поддержания соединения
    socket.on('ping', () => {
        socket.emit('pong');
        console.log(`Получен ping от ${socket.user.username} (${userId})`);
    });

    // Присоединение к чату (комнате Socket.IO)
    socket.on('joinChat', (chatId) => {
        if (!chatId) {
            console.error(`User ${userId} attempted to join invalid chat: ${chatId}`);
            return;
        }
        
        // Проверяем доступ к чату
        const db = getDb();
        db.get(`
            SELECT c.id FROM chats c 
            LEFT JOIN user_chats uc ON c.id = uc.chat_id AND uc.user_id = ?
            LEFT JOIN servers s ON c.server_id = s.id 
            LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = ?
            WHERE c.id = ? AND (uc.user_id IS NOT NULL OR sm.user_id IS NOT NULL OR s.owner_id = ?)`, 
            [userId, userId, chatId, userId], 
            (err, chat) => {
                if (err) {
                    console.error(`Ошибка при проверке доступа к чату ${chatId}:`, err.message);
                    return;
                }
                
                if (!chat) {
                    console.error(`User ${userId} does not have access to chat ${chatId}`);
                    return;
                }
                
                // Сохраняем текущий чат пользователя
                userCurrentChats.set(userId, chatId);
                
                // Сначала покидаем все чаты, в которых уже состоит пользователь
                Array.from(socket.rooms)
                    .filter(room => room.startsWith('chat_'))
                    .forEach(room => socket.leave(room));
                    
                socket.join(`chat_${chatId}`);
                console.log(`User ${socket.user.userId} (${socket.user.username}) joined chat ${chatId}`);
                
                // Отправляем подтверждение присоединения к чату
                socket.emit('joinedChat', { chatId });
            }
        );
    });

    // Получение и рассылка сообщения
    socket.on('sendMessage', async (messageData, callback) => {
      if (!messageData || !messageData.chat_id || !messageData.content) {
        console.error('Получено некорректное сообщение:', messageData);
        if (typeof callback === 'function') {
          callback({ error: 'Некорректный формат сообщения' });
        }
        return;
      }
      
      try {
        console.log('Получено сообщение от', socket.user.username);
        
        // Проверяем, имеет ли пользователь доступ к чату
        const db = getDb();
        db.get(`
          SELECT c.id FROM chats c 
          LEFT JOIN user_chats uc ON c.id = uc.chat_id AND uc.user_id = ?
          LEFT JOIN servers s ON c.server_id = s.id 
          LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = ?
          WHERE c.id = ? AND (uc.user_id IS NOT NULL OR sm.user_id IS NOT NULL OR s.owner_id = ?)`, 
          [socket.user.userId, socket.user.userId, messageData.chat_id, socket.user.userId], 
          (err, chat) => {
            if (err) {
              console.error(`Ошибка при проверке доступа к чату ${messageData.chat_id}:`, err.message);
              if (typeof callback === 'function') {
                callback({ error: 'Ошибка проверки доступа к чату' });
              }
              return;
            }
            
            if (!chat) {
              console.error(`User ${socket.user.userId} does not have access to chat ${messageData.chat_id}`);
              if (typeof callback === 'function') {
                callback({ error: 'У вас нет доступа к этому чату' });
              }
              return;
            }
            
            // Сохраняем сообщение в базе данных
            db.run('INSERT INTO messages (chat_id, user_id, content) VALUES (?, ?, ?)',
              [messageData.chat_id, messageData.user_id, messageData.content],
              function(err) {
                if (err) {
                  console.error('Ошибка при сохранении сообщения:', err.message);
                  if (typeof callback === 'function') {
                    callback({ error: 'Не удалось сохранить сообщение' });
                  }
                  return;
                }
                
                const newMessageId = this.lastID;
                
                // Разослать сообщение всем в комнате чата
                const newMessage = {
                  id: newMessageId,
                  ...messageData,
                  username: socket.user.username,
                  created_at: messageData.created_at || new Date().toISOString()
                };
                
                io.to(`chat_${messageData.chat_id}`).emit('newMessage', newMessage);
                
                // Отправляем подтверждение успешной отправки, если есть callback
                if (typeof callback === 'function') {
                  callback({ success: true, messageId: newMessageId });
                }
              }
            );
          }
        );
      } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
        if (typeof callback === 'function') {
          callback({ error: 'Не удалось отправить сообщение' });
        } else {
          socket.emit('error', { message: 'Не удалось отправить сообщение' });
        }
      }
    });

    // Выход из чата
    socket.on('leaveChat', (chatId) => {
        if (userCurrentChats.has(userId) && userCurrentChats.get(userId) === chatId) {
            userCurrentChats.delete(userId);
        }
        socket.leave(`chat_${chatId}`);
        console.log(`User ${socket.user.userId} left chat ${chatId}`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Пользователь отключен: ${socket.id}, причина: ${reason}`);

        // Удаляем сокет из списка активных соединений
        if (activeConnections.has(userId)) {
            const connections = activeConnections.get(userId);
            const index = connections.indexOf(socket.id);
            
            if (index !== -1) {
                connections.splice(index, 1);
                console.log(`Осталось активных соединений для ${socket.user.username}: ${connections.length}`);
                
                // Если это было последнее соединение пользователя
                if (connections.length === 0) {
                    activeConnections.delete(userId);
                    
                    // Используем дебаунс для предотвращения частых обновлений статуса
                    // Увеличиваем задержку до 10 секунд, чтобы дать время на переподключение
                    debounceStatusUpdate(userId, false, 10000);
                }
            }
        }
    });
    
    // Обработка ошибок сокета
    socket.on('error', (error) => {
        console.error(`Socket error for user ${userId}:`, error);
    });

    // Предотвращаем отключение из-за тайм-аута
    socket.conn.on('packet', (packet) => {
        if (packet.type === 'ping') {
            console.log(`Получен пакет ping от ${socket.user.username}`);
        }
    });
});

// Проверка соединений каждую минуту
setInterval(() => {
    console.log(`Активных подключений: ${activeConnections.size} пользователей`);
    
    // Можно добавить дополнительную логику проверки соединений здесь
}, 60000);

// Обновление статуса пользователя в БД
async function updateUserStatus(userId, isOnline) {
    try {
        const db = getDb(); // Получаем экземпляр базы данных
        const status = isOnline ? 1 : 0;
        const sql = `UPDATE users SET is_online = ?, last_active = datetime('now') WHERE id = ?`;
        
        db.run(sql, [status, userId], (err) => {
            if (err) {
                console.error(`Ошибка при обновлении статуса пользователя ${userId}:`, err.message);
            } else {
                console.log(`User ${userId} status updated to ${isOnline ? 'online' : 'offline'}`);
            }
        });
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

// Экспорт экземпляра Socket.IO
module.exports = io;