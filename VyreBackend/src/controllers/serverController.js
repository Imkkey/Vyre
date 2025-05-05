const { getDb } = require('../db/database');
const crypto = require('crypto');

// Получение списка серверов пользователя
exports.getUserServers = (req, res) => {
  const userId = req.user.userId;
  const db = getDb();
  
  const sql = `
    SELECT s.id, s.name, s.description, s.icon, s.owner_id, s.created_at,
           (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
    FROM servers s
    JOIN server_members sm ON s.id = sm.server_id
    WHERE sm.user_id = ?
    ORDER BY s.created_at DESC
  `;
  
  db.all(sql, [userId], (err, servers) => {
    if (err) {
      console.error('Ошибка при получении серверов:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении серверов' });
    }
    
    res.status(200).json(servers);
  });
};

// Создание нового сервера
exports.createServer = (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.userId;
  
  if (!name) {
    return res.status(400).json({ message: 'Необходимо указать название сервера' });
  }
  
  const db = getDb();
  
  // Генерируем уникальный invite-код
  const inviteCode = crypto.randomBytes(4).toString('hex');
  
  // Транзакция для создания сервера и добавления пользователя в него
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Создаем сервер
    db.run(
      'INSERT INTO servers (name, description, owner_id, invite_code) VALUES (?, ?, ?, ?)', 
      [name, description || '', userId, inviteCode], 
      function(err) {
        if (err) {
          console.error('Ошибка при создании сервера:', err.message);
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Ошибка сервера при создании сервера' });
        }
        
        const serverId = this.lastID;
        
        // Добавляем создателя как владельца сервера
        db.run(
          'INSERT INTO server_members (user_id, server_id, role) VALUES (?, ?, ?)',
          [userId, serverId, 'owner'],
          (err) => {
            if (err) {
              console.error('Ошибка при добавлении пользователя в сервер:', err.message);
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Ошибка сервера при создании сервера' });
            }
            
            // Создаем канал "started" по умолчанию
            db.run(
              'INSERT INTO chats (name, category, server_id) VALUES (?, ?, ?)',
              ['started', 'ТЕКСТОВЫЕ КАНАЛЫ', serverId],
              function(err) {
                if (err) {
                  console.error('Ошибка при создании канала started:', err.message);
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: 'Ошибка сервера при создании канала' });
                }
                
                const startedChatId = this.lastID;
                
                db.run('COMMIT');
                
                res.status(201).json({
                  message: 'Сервер успешно создан',
                  serverId,
                  name,
                  inviteCode,
                  defaultChannelId: startedChatId
                });
              }
            );
          }
        );
      }
    );
  });
};

// Получение информации о сервере
exports.getServerInfo = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь является участником сервера
  db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [userId, serverId], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке участия в сервере:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении информации о сервере' });
    }
    
    if (!row) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    // Получаем информацию о сервере
    db.get(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count,
             (SELECT username FROM users WHERE id = s.owner_id) as owner_name
      FROM servers s
      WHERE s.id = ?
    `, [serverId], (err, server) => {
      if (err) {
        console.error('Ошибка при получении информации о сервере:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении информации о сервере' });
      }
      
      if (!server) {
        return res.status(404).json({ message: 'Сервер не найден' });
      }
      
      res.status(200).json(server);
    });
  });
};

// Получение каналов сервера
exports.getServerChannels = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь является участником сервера
  db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [userId, serverId], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке участия в сервере:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении каналов' });
    }
    
    if (!row) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    // Получаем все каналы сервера
    db.all(`
      SELECT c.id, c.name, c.category, c.created_at,
             (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
      FROM chats c
      WHERE c.server_id = ?
      ORDER BY c.category, c.name
    `, [serverId], (err, channels) => {
      if (err) {
        console.error('Ошибка при получении каналов сервера:', err.message);
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

// Создание нового канала на сервере
exports.createServerChannel = (req, res) => {
  const serverId = req.params.serverId;
  const { name, category } = req.body;
  const userId = req.user.userId;
  
  if (!name) {
    return res.status(400).json({ message: 'Необходимо указать название канала' });
  }
  
  const db = getDb();
  
  // Проверяем, что пользователь имеет права для создания канала (владелец или админ)
  db.get('SELECT role FROM server_members WHERE user_id = ? AND server_id = ?', [userId, serverId], (err, member) => {
    if (err) {
      console.error('Ошибка при проверке прав пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при создании канала' });
    }
    
    if (!member) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    if (member.role !== 'owner' && member.role !== 'admin') {
      return res.status(403).json({ message: 'У вас нет прав для создания каналов' });
    }
    
    // Создаем канал
    db.run(
      'INSERT INTO chats (name, category, server_id) VALUES (?, ?, ?)',
      [name, category || 'ТЕКСТОВЫЕ КАНАЛЫ', serverId],
      function(err) {
        if (err) {
          console.error('Ошибка при создании канала:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при создании канала' });
        }
        
        const channelId = this.lastID;
        
        res.status(201).json({
          message: 'Канал успешно создан',
          channelId,
          name,
          category: category || 'ТЕКСТОВЫЕ КАНАЛЫ',
          serverId
        });
      }
    );
  });
};

// Получение участников сервера
exports.getServerMembers = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь является участником сервера
  db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [userId, serverId], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке участия в сервере:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении участников' });
    }
    
    if (!row) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    // Получаем всех участников сервера
    db.all(`
      SELECT u.id, u.username, sm.role, sm.joined_at,
             CASE WHEN (julianday('now') - julianday(u.last_active)) * 24 * 60 < 15 THEN 1 ELSE 0 END as is_online
      FROM users u
      JOIN server_members sm ON u.id = sm.user_id
      WHERE sm.server_id = ?
      ORDER BY 
        CASE sm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END,
        is_online DESC,
        u.username
    `, [serverId], (err, members) => {
      if (err) {
        console.error('Ошибка при получении участников сервера:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении участников' });
      }
      
      res.status(200).json(members);
    });
  });
};

// Присоединение к серверу по инвайт-коду
exports.joinServer = (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.user.userId;
  
  if (!inviteCode) {
    return res.status(400).json({ message: 'Необходимо указать инвайт-код сервера' });
  }
  
  const db = getDb();
  
  // Находим сервер по инвайт-коду
  db.get('SELECT * FROM servers WHERE invite_code = ?', [inviteCode], (err, server) => {
    if (err) {
      console.error('Ошибка при поиске сервера:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при поиске сервера' });
    }
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден или инвайт-код недействителен' });
    }
    
    // Проверяем, не является ли пользователь уже участником сервера
    db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [userId, server.id], (err, member) => {
      if (err) {
        console.error('Ошибка при проверке участия в сервере:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при присоединении к серверу' });
      }
      
      if (member) {
        return res.status(400).json({ message: 'Вы уже являетесь участником этого сервера' });
      }
      
      // Добавляем пользователя в сервер
      db.run(
        'INSERT INTO server_members (user_id, server_id, role) VALUES (?, ?, ?)',
        [userId, server.id, 'member'],
        (err) => {
          if (err) {
            console.error('Ошибка при добавлении пользователя в сервер:', err.message);
            return res.status(500).json({ message: 'Ошибка сервера при присоединении к серверу' });
          }
          
          res.status(200).json({
            message: 'Вы успешно присоединились к серверу',
            serverId: server.id,
            serverName: server.name
          });
        }
      );
    });
  });
};

// Выход из сервера
exports.leaveServer = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, является ли пользователь владельцем сервера
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, userId], (err, server) => {
    if (err) {
      console.error('Ошибка при проверке владельца сервера:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при выходе из сервера' });
    }
    
    if (server) {
      return res.status(400).json({ message: 'Владелец не может покинуть сервер. Передайте права владения другому пользователю или удалите сервер.' });
    }
    
    // Удаляем пользователя из сервера
    db.run('DELETE FROM server_members WHERE user_id = ? AND server_id = ?', [userId, serverId], function(err) {
      if (err) {
        console.error('Ошибка при удалении пользователя из сервера:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при выходе из сервера' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Вы не являетесь участником этого сервера' });
      }
      
      res.status(200).json({ message: 'Вы успешно покинули сервер' });
    });
  });
};

// Получение инвайт-кода сервера
exports.getServerInviteCode = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь имеет права для получения инвайт-кода
  db.get('SELECT sm.role FROM server_members sm WHERE sm.user_id = ? AND sm.server_id = ?', [userId, serverId], (err, member) => {
    if (err) {
      console.error('Ошибка при проверке прав пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении инвайт-кода' });
    }
    
    if (!member) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    if (member.role !== 'owner' && member.role !== 'admin') {
      return res.status(403).json({ message: 'У вас нет прав для получения инвайт-кода' });
    }
    
    // Получаем инвайт-код сервера
    db.get('SELECT invite_code FROM servers WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Ошибка при получении инвайт-кода:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении инвайт-кода' });
      }
      
      if (!server) {
        return res.status(404).json({ message: 'Сервер не найден' });
      }
      
      res.status(200).json({ inviteCode: server.invite_code });
    });
  });
};

// Обновление инвайт-кода сервера
exports.regenerateInviteCode = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь имеет права для обновления инвайт-кода
  db.get('SELECT sm.role FROM server_members sm WHERE sm.user_id = ? AND sm.server_id = ?', [userId, serverId], (err, member) => {
    if (err) {
      console.error('Ошибка при проверке прав пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при обновлении инвайт-кода' });
    }
    
    if (!member) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    if (member.role !== 'owner' && member.role !== 'admin') {
      return res.status(403).json({ message: 'У вас нет прав для обновления инвайт-кода' });
    }
    
    // Генерируем новый инвайт-код
    const newInviteCode = crypto.randomBytes(4).toString('hex');
    
    // Обновляем инвайт-код сервера
    db.run('UPDATE servers SET invite_code = ? WHERE id = ?', [newInviteCode, serverId], function(err) {
      if (err) {
        console.error('Ошибка при обновлении инвайт-кода:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при обновлении инвайт-кода' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Сервер не найден' });
      }
      
      res.status(200).json({ 
        message: 'Инвайт-код успешно обновлен',
        inviteCode: newInviteCode
      });
    });
  });
};

// Изменение роли участника сервера
exports.updateMemberRole = (req, res) => {
  const serverId = req.params.serverId;
  const memberId = req.params.memberId;
  const { role } = req.body;
  const userId = req.user.userId;
  
  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ message: 'Необходимо указать корректную роль (admin или member)' });
  }
  
  const db = getDb();
  
  // Проверяем, что пользователь является владельцем сервера
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, userId], (err, server) => {
    if (err) {
      console.error('Ошибка при проверке владельца сервера:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при изменении роли участника' });
    }
    
    if (!server) {
      return res.status(403).json({ message: 'Только владелец сервера может изменять роли участников' });
    }
    
    // Проверяем, что изменяемый пользователь не является владельцем
    db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [memberId, serverId], (err, member) => {
      if (err) {
        console.error('Ошибка при проверке участника сервера:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при изменении роли участника' });
      }
      
      if (!member) {
        return res.status(404).json({ message: 'Пользователь не является участником сервера' });
      }
      
      if (member.role === 'owner') {
        return res.status(400).json({ message: 'Невозможно изменить роль владельца сервера' });
      }
      
      // Обновляем роль пользователя
      db.run('UPDATE server_members SET role = ? WHERE user_id = ? AND server_id = ?', [role, memberId, serverId], function(err) {
        if (err) {
          console.error('Ошибка при обновлении роли участника:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при изменении роли участника' });
        }
        
        res.status(200).json({ 
          message: 'Роль участника успешно обновлена',
          userId: memberId,
          role
        });
      });
    });
  });
};

// Удаление участника из сервера (кик)
exports.removeMember = (req, res) => {
  const serverId = req.params.serverId;
  const memberId = req.params.memberId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что запрашивающий пользователь имеет права администратора или владельца
  db.get('SELECT sm.role FROM server_members sm WHERE sm.user_id = ? AND sm.server_id = ?', [userId, serverId], (err, requesterMember) => {
    if (err) {
      console.error('Ошибка при проверке прав пользователя:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при удалении участника' });
    }
    
    if (!requesterMember) {
      return res.status(403).json({ message: 'Доступ к серверу запрещен' });
    }
    
    if (requesterMember.role !== 'owner' && requesterMember.role !== 'admin') {
      return res.status(403).json({ message: 'У вас нет прав для удаления участников' });
    }
    
    // Проверяем, что удаляемый пользователь не является владельцем и что админ не пытается удалить админа
    db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [memberId, serverId], (err, targetMember) => {
      if (err) {
        console.error('Ошибка при проверке участника сервера:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при удалении участника' });
      }
      
      if (!targetMember) {
        return res.status(404).json({ message: 'Пользователь не является участником сервера' });
      }
      
      if (targetMember.role === 'owner') {
        return res.status(400).json({ message: 'Невозможно удалить владельца сервера' });
      }
      
      if (requesterMember.role === 'admin' && targetMember.role === 'admin') {
        return res.status(403).json({ message: 'Администратор не может удалить другого администратора' });
      }
      
      // Получаем все каналы сервера для отправки уведомлений
      db.all('SELECT id FROM chats WHERE server_id = ?', [serverId], (err, channels) => {
        if (err) {
          console.error('Ошибка при получении каналов сервера:', err.message);
          return res.status(500).json({ message: 'Ошибка сервера при удалении участника' });
        }
        
        // Удаляем пользователя из сервера
        db.run('DELETE FROM server_members WHERE user_id = ? AND server_id = ?', [memberId, serverId], function(err) {
          if (err) {
            console.error('Ошибка при удалении участника из сервера:', err.message);
            return res.status(500).json({ message: 'Ошибка сервера при удалении участника' });
          }
          
          // Получаем данные пользователя для уведомления
          db.get('SELECT username FROM users WHERE id = ?', [memberId], (err, user) => {
            if (err || !user) {
              console.error('Ошибка при получении данных удаленного пользователя:', err?.message);
            }
            
            // Импортируем сокет-сервер для отправки уведомлений
            const io = require('../../src/socket');
            
            // Отправляем уведомление о удалении в каждый канал сервера
            channels.forEach(channel => {
              io.to(`chat_${channel.id}`).emit('memberRemoved', {
                userId: memberId,
                username: user ? user.username : 'Unknown user',
                serverId: serverId,
                channelId: channel.id
              });
            });
            
            // Отправляем персональное уведомление удаленному пользователю
            // Это уведомление гарантирует, что пользователь мгновенно потеряет доступ
            io.emit('serverAccessRevoked', {
              userId: memberId,
              serverId: serverId
            });
            
            // Отправляем успешный ответ
            res.status(200).json({ 
              message: 'Участник успешно удален из сервера',
              userId: memberId
            });
          });
        });
      });
    });
  });
};

// Передача прав владельца сервера
exports.transferOwnership = (req, res) => {
  const serverId = req.params.serverId;
  const { newOwnerId } = req.body;
  const userId = req.user.userId;
  
  if (!newOwnerId) {
    return res.status(400).json({ message: 'Необходимо указать нового владельца сервера' });
  }
  
  const db = getDb();
  
  // Проверяем, что пользователь является владельцем сервера
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, userId], (err, server) => {
    if (err) {
      console.error('Ошибка при проверке владельца сервера:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при передаче прав владельца' });
    }
    
    if (!server) {
      return res.status(403).json({ message: 'Только владелец сервера может передать права владения' });
    }
    
    // Проверяем, что новый владелец является участником сервера
    db.get('SELECT * FROM server_members WHERE user_id = ? AND server_id = ?', [newOwnerId, serverId], (err, member) => {
      if (err) {
        console.error('Ошибка при проверке участника сервера:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при передаче прав владельца' });
      }
      
      if (!member) {
        return res.status(404).json({ message: 'Пользователь не является участником сервера' });
      }
      
      // Транзакция для передачи прав владельца
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Обновляем владельца сервера
        db.run('UPDATE servers SET owner_id = ? WHERE id = ?', [newOwnerId, serverId], function(err) {
          if (err) {
            console.error('Ошибка при обновлении владельца сервера:', err.message);
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Ошибка сервера при передаче прав владельца' });
          }
          
          // Изменяем роль старого владельца на админа
          db.run('UPDATE server_members SET role = ? WHERE user_id = ? AND server_id = ?', ['admin', userId, serverId], function(err) {
            if (err) {
              console.error('Ошибка при обновлении роли текущего владельца:', err.message);
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Ошибка сервера при передаче прав владельца' });
            }
            
            // Изменяем роль нового владельца
            db.run('UPDATE server_members SET role = ? WHERE user_id = ? AND server_id = ?', ['owner', newOwnerId, serverId], function(err) {
              if (err) {
                console.error('Ошибка при обновлении роли нового владельца:', err.message);
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Ошибка сервера при передаче прав владельца' });
              }
              
              db.run('COMMIT');
              
              res.status(200).json({ 
                message: 'Права владельца успешно переданы',
                serverId,
                newOwnerId
              });
            });
          });
        });
      });
    });
  });
};

// Удаление сервера
exports.deleteServer = (req, res) => {
  const serverId = req.params.serverId;
  const userId = req.user.userId;
  
  const db = getDb();
  
  // Проверяем, что пользователь является владельцем сервера
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, userId], (err, server) => {
    if (err) {
      console.error('Ошибка при проверке владельца сервера:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
    }
    
    if (!server) {
      return res.status(403).json({ message: 'Только владелец сервера может удалить сервер' });
    }
    
    // Транзакция для удаления сервера и связанных данных
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Удаляем все сообщения из каналов сервера
      db.run(`
        DELETE FROM messages 
        WHERE chat_id IN (SELECT id FROM chats WHERE server_id = ?)
      `, [serverId], function(err) {
        if (err) {
          console.error('Ошибка при удалении сообщений:', err.message);
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
        }
        
        // Удаляем все каналы сервера
        db.run('DELETE FROM chats WHERE server_id = ?', [serverId], function(err) {
          if (err) {
            console.error('Ошибка при удалении каналов:', err.message);
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
          }
          
          // Удаляем всех участников сервера
          db.run('DELETE FROM server_members WHERE server_id = ?', [serverId], function(err) {
            if (err) {
              console.error('Ошибка при удалении участников:', err.message);
              db.run('ROLLBACK');
              return res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
            }
            
            // Удаляем сам сервер
            db.run('DELETE FROM servers WHERE id = ?', [serverId], function(err) {
              if (err) {
                console.error('Ошибка при удалении сервера:', err.message);
                db.run('ROLLBACK');
                return res.status(500).json({ message: 'Ошибка сервера при удалении сервера' });
              }
              
              db.run('COMMIT');
              
              res.status(200).json({ 
                message: 'Сервер успешно удален',
                serverId
              });
            });
          });
        });
      });
    });
  });
};