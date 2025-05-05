const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Получение секретного ключа JWT из переменных окружения
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // токен действителен 7 дней

// Маршрут для проверки валидности токена
router.get('/validate-token', (req, res) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Не предоставлен токен авторизации' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Проверяем валидность токена
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        console.log('Ошибка проверки токена:', err.message);
        
        // Если токен просрочен, создаем новый
        if (err.name === 'TokenExpiredError') {
          try {
            // Декодируем старый токен без проверки, чтобы получить payload
            const decodedExpired = jwt.decode(token);
            
            if (!decodedExpired || !decodedExpired.userId) {
              return res.status(401).json({ message: 'Недействительный токен' });
            }
            
            // Создаем новый токен с тем же payload
            const newToken = jwt.sign(
              { userId: decodedExpired.userId, username: decodedExpired.username },
              JWT_SECRET,
              { expiresIn: JWT_EXPIRES_IN }
            );
            
            // Возвращаем новый токен
            return res.json({ 
              valid: true, 
              renewed: true, 
              token: newToken, 
              userId: decodedExpired.userId,
              username: decodedExpired.username
            });
          } catch (renewError) {
            console.error('Ошибка при обновлении токена:', renewError);
            return res.status(401).json({ message: 'Не удалось обновить токен' });
          }
        }
        
        return res.status(401).json({ message: 'Недействительный токен' });
      }
      
      // Если токен валидный, возвращаем положительный ответ
      return res.json({ 
        valid: true, 
        renewed: false,
        userId: decoded.userId,
        username: decoded.username 
      });
    });
  } catch (error) {
    console.error('Ошибка при проверке токена:', error);
    res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;