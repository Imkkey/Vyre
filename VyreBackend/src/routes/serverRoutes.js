const express = require('express');
const router = express.Router();
const serverController = require('../controllers/serverController');
const { verifyToken } = require('../middleware/auth');

// Применяем middleware аутентификации ко всем маршрутам
router.use(verifyToken);

// Получение списка серверов пользователя
router.get('/user', serverController.getUserServers);

// Создание нового сервера
router.post('/', serverController.createServer);

// Получение информации о сервере
router.get('/:serverId', serverController.getServerInfo);

// Получение каналов сервера
router.get('/:serverId/channels', serverController.getServerChannels);

// Создание нового канала на сервере
router.post('/:serverId/channels', serverController.createServerChannel);

// Получение участников сервера
router.get('/:serverId/members', serverController.getServerMembers);

// Присоединение к серверу по инвайт-коду
router.post('/join', serverController.joinServer);

// Выход из сервера
router.delete('/:serverId/leave', serverController.leaveServer);

// Получение инвайт-кода сервера
router.get('/:serverId/invite', serverController.getServerInviteCode);

// Обновление инвайт-кода сервера
router.post('/:serverId/invite/regenerate', serverController.regenerateInviteCode);

// Изменение роли участника сервера (только для владельца)
router.put('/:serverId/members/:memberId/role', serverController.updateMemberRole);

// Удаление участника из сервера (кик)
router.delete('/:serverId/members/:memberId', serverController.removeMember);

// Передача прав владельца сервера
router.post('/:serverId/transfer-ownership', serverController.transferOwnership);

// Удаление сервера (только для владельца)
router.delete('/:serverId', serverController.deleteServer);

module.exports = router;