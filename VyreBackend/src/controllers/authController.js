const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb, addToStandardChannels } = require('../db/database');

// JWT секрет и срок действия токена
const JWT_SECRET = process.env.JWT_SECRET || 'vyre-secret-key';
const JWT_EXPIRES_IN = '7d'; // увеличен до 7 дней

// Регистрация нового пользователя
exports.register = async (req, res) => {
    const { username, password } = req.body;
    
    // Проверяем, есть ли имя пользователя и пароль
    if (!username || !password) {
        return res.status(400).json({ message: 'Необходимо указать имя пользователя и пароль' });
    }
    
    try {
        // Хешируем пароль
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const db = getDb();
        
        // Проверяем, существует ли пользователь с таким именем
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                console.error('Ошибка при проверке имени пользователя:', err.message);
                return res.status(500).json({ message: 'Ошибка сервера при регистрации' });
            }
            
            if (user) {
                return res.status(409).json({ message: 'Пользователь с таким именем уже существует' });
            }
            
            // Создаем нового пользователя
            db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
                if (err) {
                    console.error('Ошибка при создании пользователя:', err.message);
                    return res.status(500).json({ message: 'Ошибка сервера при регистрации' });
                }
                
                const userId = this.lastID;
                
                // Добавляем пользователя в Global чат и другие стандартные чаты
                addToStandardChannels(userId, (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении пользователя в Global чат:', err.message);
                        // Продолжаем регистрацию, даже если не удалось добавить в чат
                    }
                    
                    // Создаем JWT токен с увеличенным сроком действия
                    const token = jwt.sign(
                        { userId, username },
                        JWT_SECRET,
                        { expiresIn: JWT_EXPIRES_IN }
                    );
                    
                    res.status(201).json({
                        message: 'Пользователь успешно зарегистрирован',
                        token,
                        userId,
                        username
                    });
                });
            });
        });
    } catch (err) {
        console.error('Ошибка при хешировании пароля:', err.message);
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    }
};

// Аутентификация пользователя
exports.login = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Необходимо указать имя пользователя и пароль' });
  }
  
  try {
    const db = getDb();
    
    // Ищем пользователя по имени
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('Ошибка при поиске пользователя:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при входе' });
      }
      
      if (!user) {
        return res.status(400).json({ message: 'Неверное имя пользователя или пароль' });
      }
      
      try {
        // Сравниваем пароли
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
          return res.status(400).json({ message: 'Неверное имя пользователя или пароль' });
        }
        
        // Создаем JWT токен с увеличенным сроком действия
        const token = jwt.sign(
          { userId: user.id, username: user.username },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.status(200).json({
          message: 'Вход выполнен успешно',
          token,
          userId: user.id,
          username: user.username
        });
      } catch (error) {
        console.error('Ошибка при проверке пароля:', error.message);
        return res.status(500).json({ message: 'Ошибка сервера при входе' });
      }
    });
  } catch (error) {
    console.error('Ошибка при входе:', error.message);
    res.status(500).json({ message: 'Ошибка сервера при входе' });
  }
};

// Получение данных текущего пользователя
exports.getCurrentUser = (req, res) => {
  try {
    // Данные пользователя уже есть в req.user благодаря middleware verifyToken
    const { userId, username } = req.user;
    
    const db = getDb();
    
    // Получаем дополнительные данные пользователя из БД
    db.get('SELECT id, username, is_online, created_at FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Ошибка при получении данных пользователя:', err.message);
        return res.status(500).json({ message: 'Ошибка сервера при получении данных пользователя' });
      }
      
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
      
      // Возвращаем данные пользователя
      res.status(200).json({
        id: user.id,
        username: user.username,
        is_online: user.is_online,
        created_at: user.created_at
      });
    });
  } catch (error) {
    console.error('Ошибка при получении данных пользователя:', error.message);
    res.status(500).json({ message: 'Ошибка сервера при получении данных пользователя' });
  }
};