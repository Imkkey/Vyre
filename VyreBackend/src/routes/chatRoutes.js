const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middleware/auth');

// Применяем middleware аутентификации ко всем маршрутам
router.use(verifyToken);

// 1. Статичные маршруты без параметров
router.post('/', chatController.createChat);
router.post('/user-status', chatController.updateUserStatus);

// 2. Специфичные маршруты с вложенными путями
router.get('/direct/list', chatController.getUserDirectChats);
router.post('/direct', chatController.createDirectChat);
router.get('/channels/all', chatController.getAllChannels);
router.get('/debug/channel-info/:channelId', chatController.getChannelDebugInfo);

// 3. Специфичные маршруты с одним уровнем и параметрами 
router.get('/info/:chatId', chatController.getChatInfo);
router.get('/server-info/:chatId', chatController.getChatServerInfo);
router.get('/channels/:channelId', chatController.getChannelInfo);

// 4. Общие маршруты с параметрами на главном уровне (эти должны быть последними)
router.get('/:userId', chatController.getUserChats);
router.get('/:chatId/users', chatController.getChatUsers);
router.get('/:chatId/messages', chatController.getChatMessages);

module.exports = router;