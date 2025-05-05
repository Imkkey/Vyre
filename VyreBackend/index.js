const { app, server } = require('./server');
// Импортируем Socket.IO после запуска сервера
const io = require('./src/socket');

// Порт сервера
const PORT = process.env.PORT || 3000;

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен и слушает порт ${PORT}`);
  console.log(`Socket.IO инициализирован`);
  console.log(`Для проверки здоровья сервера: http://localhost:${PORT}/api/health`);
});