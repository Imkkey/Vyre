const jwt = require('jsonwebtoken');

// JWT секрет, должен совпадать с тем, что используется в authController
const JWT_SECRET = process.env.JWT_SECRET || 'vyre-secret-key';

// Middleware для проверки JWT-токена
const verifyToken = (req, res, next) => {
  // Получаем заголовок Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: 'Отсутствует токен аутентификации' });
  }
  
  // Формат заголовка "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Неверный формат токена' });
  }
  
  const token = parts[1];
  
  try {
    // Проверяем валидность токена
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Добавляем информацию о пользователе в объект запроса
    req.user = decoded;
    
    next(); // Переходим к следующему middleware или обработчику маршрута
  } catch (error) {
    console.error('Ошибка проверки токена:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Токен истек' });
    }
    
    return res.status(401).json({ message: 'Недействительный токен' });
  }
};

module.exports = { verifyToken };