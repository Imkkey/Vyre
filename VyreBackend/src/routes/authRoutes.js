const express = require('express');
const { getDb } = require('../db/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const authController = require('../controllers/authController');

// Маршрут регистрации
router.post('/register', authController.register);

// Маршрут входа
router.post('/login', authController.login);

// Маршрут для проверки валидности токена
router.get('/validate-token', verifyToken, (req, res) => {
  // Если middleware verifyToken пропустил запрос, значит токен валидный
  return res.status(200).json({ valid: true });
});

// Маршрут для получения данных текущего пользователя
router.get('/me', verifyToken, authController.getCurrentUser);

// Создаем функцию-обработчик для получения пользователей
const getUsers = (req, res) => {
  const db = getDb();
  
  // Получаем всех пользователей, кроме текущего
  db.all('SELECT id, username, is_online FROM users WHERE id != ?', [req.user.userId], (err, users) => {
    if (err) {
      console.error('Ошибка при получении пользователей:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении пользователей' });
    }
    
    return res.status(200).json(users);
  });
};

// Маршрут для получения списка всех пользователей
router.get('/users', verifyToken, getUsers);

module.exports = router;