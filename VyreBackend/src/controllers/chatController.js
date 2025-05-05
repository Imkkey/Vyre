const { getDb } = require('../db/database');

// Получение списка чатов пользователя
exports.getUserChats = (req, res) => {
  const userId = req.params.userId;
  
  // Проверяем, что пользователь запрашивает свои чаты
  if (userId != req.user.userId) {
    return res.status(403).json({ message: 'Доступ запрещен' });
  }
  
  const db = getDb();
  
  // Получаем все чаты, в которых участвует пользователь
  const sql = `
    SELECT c.id, c.name, c.created_at,
           (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage
    FROM chats c
    JOIN user_chats uc ON c.id = uc.chat_id
    WHERE uc.user_id = ?
    ORDER BY (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) DESC
  `;
  
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Ошибка при получении чатов:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении чатов' });
    }
    
    res.status(200).json(rows);
  });
};

// Получение информации о конкретном чате
exports.getChatInfo = (req, res) => {
  const chatId = req.params.chatId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, является ли пользователь участником чата или участником/владельцем сервера
  const accessCheckQuery = `
    SELECT 1 
    FROM (
      SELECT 1 
      FROM user_chats 
      WHERE user_id = ? AND chat_id = ?
      
      UNION
      
      SELECT 1 
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      WHERE c.id = ? AND s.owner_id = ?
      
      UNION
      
      SELECT 1
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      JOIN server_members sm ON s.id = sm.server_id
      WHERE c.id = ? AND sm.user_id = ?
    ) AS access
  `;
  
  db.get(accessCheckQuery, [userId, chatId, chatId, userId, chatId, userId], (err, access) => {
    if (err) {
      console.error('Ошибка при проверке доступа к чату:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении информации о чате' });
    }
    
    if (!access) {
      console.log(`Пользователь ${userId} пытается получить информацию о чате ${chatId}, доступ отклонен`);
      return res.status(403).json({ message: 'Доступ к чату запрещен' });
    }
    
    // Получаем информацию о чате
    db.get('SELECT * FROM chats WHERE id = ?', [chatId], (err, chat) => {
      if (err) {
        console.error('Ошибка при получении информации о чате:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении информации о чате' });
      }
      
      if (!chat) {
        return res.status(404).json({ message: 'Чат не найден' });
      }
      
      res.status(200).json(chat);
    });
  });
};

// Получение сообщений чата
exports.getChatMessages = (req, res) => {
  const chatId = req.params.chatId;
  const userId = req.user.userId;
  const limit = req.query.limit || 50; // По умолчанию 50 сообщений
  const offset = req.query.offset || 0;
  
  const db = getDb();
  
  // Проверяем, есть ли чат вообще в базе данных
  db.get('SELECT id, server_id FROM chats WHERE id = ?', [chatId], (err, chat) => {
    if (err) {
      console.error('Ошибка при проверке существования чата:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении сообщений' });
    }
    
    if (!chat) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    
    // Если чат принадлежит серверу, проверяем права к серверу
    if (chat.server_id) {
      db.get(
        'SELECT sm.role FROM server_members sm WHERE sm.user_id = ? AND sm.server_id = ? ' +
        'UNION SELECT "owner" as role FROM servers s WHERE s.id = ? AND s.owner_id = ?',
        [userId, chat.server_id, chat.server_id, userId],
        (err, serverAccess) => {
          if (err) {
            console.error('Ошибка при проверке доступа к серверу:', err.message);
            return res.status(500).json({ message: 'Ошибка сервера при получении сообщений' });
          }
          
          if (serverAccess) {
            // Пользователь имеет доступ к серверу, получаем сообщения
            getMessages(chatId, limit, offset);
            return;
          }
          
          // Нет доступа к серверу, проверяем доступ через user_chats
          checkUserChatAccess();
        }
      );
    } else {
      // Чат не принадлежит серверу, проверяем через user_chats
      checkUserChatAccess();
    }
    
    // Проверка доступа через таблицу user_chats
    function checkUserChatAccess() {
      db.get('SELECT 1 FROM user_chats WHERE user_id = ? AND chat_id = ?', [userId, chatId], (err, access) => {
        if (err) {
          console.error('Ошибка при проверке доступа к чату через user_chats:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при получении сообщений' });
        }
        
        if (!access) {
          console.log(`Пользователь ${userId} пытается получить доступ к чату ${chatId}, доступ отклонен`);
          return res.status(403).json({ message: 'Доступ к чату запрещен' });
        }
        
        // Пользователь имеет доступ через user_chats, получаем сообщения
        getMessages(chatId, limit, offset);
      });
    }
    
    // Функция для получения сообщений чата
    function getMessages(chatId, limit, offset) {
      const sql = `
        SELECT m.*, u.username
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC
        LIMIT ? OFFSET ?
      `;
      
      db.all(sql, [chatId, limit, offset], (err, messages) => {
        if (err) {
          console.error('Ошибка при получении сообщений:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при получении сообщений' });
        }
        
        res.status(200).json(messages);
      });
    }
  });
};

// Создание нового чата
exports.createChat = (req, res) => {
  const { name } = req.body;
  const userId = req.user.userId;
  
  if (!name) {
    return res.status(400).json({ message: 'Необходимо указать название чата' });
  }
  
  const db = getDb();
  
  // Транзакция для создания чата и добавления пользователя в него
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Создаем чат
    db.run('INSERT INTO chats (name) VALUES (?)', [name], function(err) {
      if (err) {
        console.error('Ошибка при создании чата:', err.message);
        db.run('ROLLBACK');
        return res.status(500).json({ message: 'Ошибка сервера при создании чата' });
      }
      
      const chatId = this.lastID;
      
      // Добавляем пользователя в чат
      db.run('INSERT INTO user_chats (user_id, chat_id) VALUES (?, ?)', [userId, chatId], (err) => {
        if (err) {
          console.error('Ошибка при добавлении пользователя в чат:', err.message);
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Ошибка сервера при создании чата' });
        }
        
        db.run('COMMIT');
        
        res.status(201).json({
          message: 'Чат успешно создан',
          chatId,
          name
        });
      });
    });
  });
};

// Создание личного чата между пользователями
exports.createDirectChat = (req, res) => {
  const { target_user_id } = req.body;
  const userId = req.user.userId;
  
  if (!target_user_id) {
    return res.status(400).json({ message: 'Необходимо указать ID пользователя для создания личного чата' });
  }
  
  // Проверяем, что пользователь не пытается создать чат с самим собой
  if (userId.toString() === target_user_id.toString()) {
    return res.status(400).json({ message: 'Нельзя создать личный чат с самим собой' });
  }
  
  const db = getDb();
  
  // Проверяем, существует ли пользователь, с которым создается чат
  db.get('SELECT id, username FROM users WHERE id = ?', [target_user_id], (err, targetUser) => {
    if (err) {
      console.error('Ошибка при проверке существования пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
    }
    
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    // Проверяем, существует ли уже личный чат между этими пользователями
    const checkChatSql = `
      SELECT c.id
      FROM chats c
      JOIN user_chats uc1 ON c.id = uc1.chat_id
      JOIN user_chats uc2 ON c.id = uc2.chat_id
      WHERE c.is_direct = 1
        AND uc1.user_id = ?
        AND uc2.user_id = ?
        AND c.server_id IS NULL
      LIMIT 1
    `;
    
    db.get(checkChatSql, [userId, target_user_id], (err, existingChat) => {
      if (err) {
        console.error('Ошибка при проверке существования личного чата:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
      }
      
      if (existingChat) {
        // Если чат уже существует, возвращаем его ID
        return res.status(200).json({
          message: 'Личный чат уже существует',
          chatId: existingChat.id
        });
      }
      
      // Получаем имя текущего пользователя
      db.get('SELECT username FROM users WHERE id = ?', [userId], (err, currentUser) => {
        if (err) {
          console.error('Ошибка при получении имени пользователя:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
        }
        
        // Создаем имя для личного чата (например, "user1 & user2")
        const chatName = `${currentUser.username} & ${targetUser.username}`;
        
        // Транзакция для создания чата и добавления обоих пользователей в него
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          // Создаем чат с флагом is_direct = 1
          db.run('INSERT INTO chats (name, is_direct) VALUES (?, 1)', [chatName], function(err) {
            if (err) {
              console.error('Ошибка при создании личного чата:', err.message);
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
            }
            
            const chatId = this.lastID;
            
            // Добавляем обоих пользователей в чат
            db.run('INSERT INTO user_chats (user_id, chat_id) VALUES (?, ?)', [userId, chatId], (err) => {
              if (err) {
                console.error('Ошибка при добавлении пользователя в личный чат:', err.message);
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
              }
              
              db.run('INSERT INTO user_chats (user_id, chat_id) VALUES (?, ?)', [target_user_id, chatId], (err) => {
                if (err) {
                  console.error('Ошибка при добавлении пользователя в личный чат:', err.message);
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: 'Ошибка сервера при создании личного чата' });
                }
                
                db.run('COMMIT');
                
                res.status(201).json({
                  message: 'Личный чат успешно создан',
                  chatId,
                  chatName
                });
              });
            });
          });
        });
      });
    });
  });
};

// Получение списка пользователей в чате
exports.getChatUsers = (req, res) => {
  const chatId = req.params.chatId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, является ли пользователь участником чата или участником/владельцем сервера
  const accessCheckQuery = `
    SELECT 1 
    FROM (
      SELECT 1 
      FROM user_chats 
      WHERE user_id = ? AND chat_id = ?
      
      UNION
      
      SELECT 1 
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      WHERE c.id = ? AND s.owner_id = ?
      
      UNION
      
      SELECT 1
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      JOIN server_members sm ON s.id = sm.server_id
      WHERE c.id = ? AND sm.user_id = ?
    ) AS access
  `;
  
  db.get(accessCheckQuery, [userId, chatId, chatId, userId, chatId, userId], (err, access) => {
    if (err) {
      console.error('Ошибка при проверке доступа к чату:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении пользователей чата' });
    }
    
    if (!access) {
      console.log(`Пользователь ${userId} пытается получить список пользователей чата ${chatId}, доступ отклонен`);
      return res.status(403).json({ message: 'Доступ к чату запрещен' });
    }
    
    // Получаем всех пользователей чата и участников сервера, к которому относится чат
    const sql = `
      SELECT DISTINCT u.id, u.username, 
             CASE WHEN (julianday('now') - julianday(u.last_active)) * 24 * 60 < 15 
                  OR u.is_online = 1 THEN 1 ELSE 0 END as is_online
      FROM users u
      LEFT JOIN user_chats uc ON u.id = uc.user_id AND uc.chat_id = ?
      LEFT JOIN chats c ON c.id = ?
      LEFT JOIN servers s ON c.server_id = s.id
      LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = u.id
      WHERE uc.user_id IS NOT NULL
         OR sm.user_id IS NOT NULL
         OR u.id = s.owner_id
      ORDER BY is_online DESC, u.username
    `;
    
    db.all(sql, [chatId, chatId], (err, users) => {
      if (err) {
        console.error('Ошибка при получении пользователей чата:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении пользователей чата' });
      }
      
      res.status(200).json(users);
    });
  });
};

// Получение списка каналов (чатов)
exports.getAllChannels = (req, res) => {
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем структуру таблицы chats
  db.all("PRAGMA table_info(chats)", (err, rows) => {
    if (err) {
      console.error('Ошибка при проверке структуры таблицы chats:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении каналов' });
    }
    
    const hasCategory = rows.some(row => row.name === 'category');
    const categoryCol = hasCategory ? 'c.category' : '"ТЕКСТОВЫЕ КАНАЛЫ" as category';
    
    // Получаем все доступные каналы (чаты)
    const sql = `
      SELECT c.id, c.name, ${categoryCol}, c.created_at,
             (SELECT COUNT(*) FROM user_chats WHERE chat_id = c.id) as user_count
      FROM chats c
      JOIN user_chats uc ON c.id = uc.chat_id
      WHERE uc.user_id = ? AND c.name != 'global'
      GROUP BY c.id
      ORDER BY ${hasCategory ? 'c.category' : 'category'}, c.name
    `;
    
    db.all(sql, [userId], (err, channels) => {
      if (err) {
        console.error('Ошибка при получении каналов:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении каналов' });
      }
      
      // Группируем каналы по категориям
      const categorizedChannels = channels.reduce((acc, channel) => {
        const category = channel.category || 'ТЕКСТОВЫЕ КАНАЛЫ';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(channel);
        return acc;
      }, {});
      
      res.status(200).json(categorizedChannels);
    });
  });
};

// Получение информации о конкретном канале
exports.getChannelInfo = (req, res) => {
  const channelId = req.params.channelId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Используем тот же метод проверки доступа, что и в других функциях
  const accessCheckQuery = `
    SELECT 1 
    FROM (
      SELECT 1 
      FROM user_chats 
      WHERE user_id = ? AND chat_id = ?
      
      UNION
      
      SELECT 1 
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      WHERE c.id = ? AND s.owner_id = ?
      
      UNION
      
      SELECT 1
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      JOIN server_members sm ON s.id = sm.server_id
      WHERE c.id = ? AND sm.user_id = ?
    ) AS access
  `;
  
  db.get(accessCheckQuery, [userId, channelId, channelId, userId, channelId, userId], (err, access) => {
    if (err) {
      console.error('Ошибка при проверке доступа к каналу:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении информации о канале' });
    }
    
    if (!access) {
      console.log(`Пользователь ${userId} пытается получить информацию о канале ${channelId}, доступ отклонен`);
      return res.status(403).json({ message: 'Доступ к каналу запрещен' });
    }
    
    // Получаем информацию о канале
    db.get('SELECT * FROM chats WHERE id = ?', [channelId], (err, channel) => {
      if (err) {
        console.error('Ошибка при получении информации о канале:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении информации о канале' });
      }
      
      if (!channel) {
        return res.status(404).json({ message: 'Канал не найден' });
      }
      
      res.status(200).json(channel);
    });
  });
};

// Отладочная функция для получения информации о канале
exports.getChannelDebugInfo = (req, res) => {
  const channelId = req.params.channelId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Получаем базовую информацию о канале без проверки доступа
  db.get('SELECT c.*, s.id as server_id, s.name as server_name, s.owner_id as server_owner_id FROM chats c LEFT JOIN servers s ON c.server_id = s.id WHERE c.id = ?', 
    [channelId], 
    (err, channel) => {
      if (err) {
        console.error('Ошибка при получении отладочной информации о канале:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении отладочной информации' });
      }
      
      if (!channel) {
        return res.status(404).json({ 
          message: 'Канал не найден',
          error: 'NOT_FOUND',
          channelId: channelId
        });
      }
      
      // Проверяем, является ли пользователь участником канала
      db.get('SELECT 1 FROM user_chats WHERE user_id = ? AND chat_id = ?', [userId, channelId], (err, userChat) => {
        if (err) {
          console.error('Ошибка при проверке участия в канале:', err.message);
        }
        
        // Проверяем, является ли пользователь участником сервера
        let checkServerMembership = Promise.resolve(null);
        if (channel.server_id) {
          checkServerMembership = new Promise((resolve) => {
            db.get('SELECT role FROM server_members WHERE user_id = ? AND server_id = ?', 
              [userId, channel.server_id], 
              (err, serverMembership) => {
                if (err) {
                  console.error('Ошибка при проверке участия в сервере:', err.message);
                  resolve(null);
                } else {
                  resolve(serverMembership);
                }
              }
            );
          });
        }
        
        Promise.resolve(checkServerMembership).then((serverMembership) => {
          // Формируем отладочную информацию
          const debugInfo = {
            channel_id: channel.id,
            channel_name: channel.name,
            server_id: channel.server_id,
            server_name: channel.server_name,
            server_owner_id: channel.server_owner_id,
            is_user_in_channel: !!userChat,
            is_user_in_server: !!serverMembership,
            user_server_role: serverMembership ? serverMembership.role : null,
            is_user_server_owner: channel.server_owner_id === userId,
            created_at: channel.created_at,
            access_checks: {
              via_user_chats: !!userChat,
              via_server_membership: !!serverMembership,
              via_server_ownership: channel.server_owner_id === userId
            }
          };
          
          res.status(200).json(debugInfo);
        });
      });
    }
  );
};

// Обновление статуса пользователя (онлайн)
exports.updateUserStatus = (req, res) => {
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Обновляем время последней активности пользователя
  db.run('UPDATE users SET last_active = datetime("now") WHERE id = ?', [userId], (err) => {
    if (err) {
      console.error('Ошибка при обновлении статуса пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при обновлении статуса' });
    }
    
    res.status(200).json({ message: 'Статус пользователя обновлен' });
  });
};

// Отправка сообщения через HTTP API (альтернатива сокетам)
exports.sendMessage = (req, res) => {
  const { chat_id, content, user_id } = req.body;
  
  // Проверка обязательных полей
  if (!chat_id || !content) {
    return res.status(400).json({ message: 'Необходимо указать ID чата и содержание сообщения' });
  }
  
  // Проверяем, что пользователь отправляет сообщение от своего имени
  if (user_id && user_id.toString() !== req.user.userId.toString()) {
    return res.status(403).json({ message: 'Вы не можете отправлять сообщения от имени другого пользователя' });
  }
  
  const userId = req.user.userId;
  const username = req.user.username;
  const db = getDb();
  
  // Проверяем, имеет ли пользователь доступ к чату
  const accessCheckQuery = `
    SELECT 1 
    FROM (
      SELECT 1 
      FROM user_chats 
      WHERE user_id = ? AND chat_id = ?
      
      UNION
      
      SELECT 1 
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      WHERE c.id = ? AND s.owner_id = ?
      
      UNION
      
      SELECT 1
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      JOIN server_members sm ON s.id = sm.server_id
      WHERE c.id = ? AND sm.user_id = ?
    ) AS access
  `;
  
  db.get(accessCheckQuery, [userId, chat_id, chat_id, userId, chat_id, userId], (err, access) => {
    if (err) {
      console.error('Ошибка при проверке доступа к чату:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при отправке сообщения' });
    }
    
    if (!access) {
      console.log(`Пользователь ${userId} пытается отправить сообщение в чат ${chat_id}, доступ отклонен`);
      return res.status(403).json({ message: 'У вас нет доступа к этому чату' });
    }
    
    // Сохраняем сообщение в базе данных
    const timestamp = new Date().toISOString();
    db.run('INSERT INTO messages (chat_id, user_id, content, created_at) VALUES (?, ?, ?, ?)',
      [chat_id, userId, content, timestamp],
      function(err) {
        if (err) {
          console.error('Ошибка при сохранении сообщения:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при сохранении сообщения' });
        }
        
        const messageId = this.lastID;
        
        // Формируем объект сообщения для ответа
        const message = {
          id: messageId,
          chat_id,
          user_id: userId,
          username,
          content,
          created_at: timestamp
        };
        
        // Отправляем сообщение всем подключенным к чату через сокеты, если возможно
        const io = require('../socket/index');
        if (io) {
          try {
            io.to(`chat_${chat_id}`).emit('newMessage', message);
          } catch (socketErr) {
            console.error('Ошибка при отправке сообщения через сокет:', socketErr);
            // Продолжаем выполнение, даже если отправка через сокет не удалась
          }
        }
        
        // Отправляем успешный ответ
        res.status(201).json({
          message: 'Сообщение успешно отправлено',
          id: messageId,
          created_at: timestamp
        });
      }
    );
  });
};

// Получение информации о сервере, к которому принадлежит чат
exports.getChatServerInfo = (req, res) => {
  const chatId = req.params.chatId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, имеет ли пользователь доступ к чату
  const accessCheckQuery = `
    SELECT 1 
    FROM (
      SELECT 1 
      FROM user_chats 
      WHERE user_id = ? AND chat_id = ?
      
      UNION
      
      SELECT 1 
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      WHERE c.id = ? AND s.owner_id = ?
      
      UNION
      
      SELECT 1
      FROM chats c
      JOIN servers s ON c.server_id = s.id
      JOIN server_members sm ON s.id = sm.server_id
      WHERE c.id = ? AND sm.user_id = ?
    ) AS access
  `;
  
  db.get(accessCheckQuery, [userId, chatId, chatId, userId, chatId, userId], (err, access) => {
    if (err) {
      console.error('Ошибка при проверке доступа к чату:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении информации о сервере чата' });
    }
    
    if (!access) {
      console.log(`Пользователь ${userId} пытается получить информацию о сервере чата ${chatId}, доступ отклонен`);
      return res.status(403).json({ message: 'Доступ к информации о чате запрещен' });
    }
    
    // Получаем информацию о сервере, к которому принадлежит чат
    db.get(
      `SELECT c.id as chat_id, c.name as chat_name, c.server_id, 
              s.name as server_name, s.owner_id as server_owner_id
       FROM chats c
       LEFT JOIN servers s ON c.server_id = s.id
       WHERE c.id = ?`,
      [chatId],
      (err, chatServerInfo) => {
        if (err) {
          console.error('Ошибка при получении информации о сервере чата:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при получении информации о сервере чата' });
        }
        
        if (!chatServerInfo) {
          return res.status(404).json({ message: 'Чат не найден' });
        }
        
        res.status(200).json(chatServerInfo);
      }
    );
  });
};

// Получение списка личных чатов пользователя
exports.getUserDirectChats = (req, res) => {
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Получаем все личные чаты пользователя
  const sql = `
    SELECT c.id, c.name, c.created_at,
           (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage,
           (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessageTime,
           (
             SELECT u.username 
             FROM users u
             JOIN user_chats uc ON u.id = uc.user_id
             WHERE uc.chat_id = c.id AND u.id != ?
             LIMIT 1
           ) as recipientName,
           (
             SELECT u.id 
             FROM users u
             JOIN user_chats uc ON u.id = uc.user_id
             WHERE uc.chat_id = c.id AND u.id != ?
             LIMIT 1
           ) as recipientId,
           (
             SELECT 
               CASE WHEN (julianday('now') - julianday(u.last_active)) * 24 * 60 < 15 
                    OR u.is_online = 1 THEN 1 ELSE 0 END
             FROM users u
             JOIN user_chats uc ON u.id = uc.user_id
             WHERE uc.chat_id = c.id AND u.id != ?
             LIMIT 1
           ) as isRecipientOnline
    FROM chats c
    JOIN user_chats uc ON c.id = uc.chat_id
    WHERE uc.user_id = ? AND c.is_direct = 1
    ORDER BY lastMessageTime DESC NULLS LAST
  `;
  
  db.all(sql, [userId, userId, userId, userId], (err, rows) => {
    if (err) {
      console.error('Ошибка при получении личных чатов:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении личных чатов' });
    }
    
    res.status(200).json(rows);
  });
};