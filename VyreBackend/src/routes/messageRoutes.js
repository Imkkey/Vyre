const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middleware/auth');

// Применяем middleware аутентификации ко всем маршрутам
router.use(verifyToken);

// Маршрут для отправки сообщения через HTTP API
router.post('/send', chatController.sendMessage);

module.exports = router;