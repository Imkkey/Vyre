// Импорт необходимых модулей
require('dotenv').config(); // Загрузка переменных окружения из .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path'); // Для работы с путями файлов

// Override path-to-regexp internals to catch the error
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  const result = originalRequire.call(this, id);
  
  if (id === 'path-to-regexp') {
    const originalParse = result.parse;
    
    result.parse = function(str, options = {}) {
      if (typeof str === 'string') {
        console.log(`Parsing path: "${str}"`);
        
        // Check for problematic patterns
        if ((str.includes(':') && str.match(/:[^a-zA-Z0-9_]/)) || 
            (str.includes('*') && str.match(/\*[^a-zA-Z0-9_]/)) ||
            (str.endsWith(':') || str.endsWith('*'))) {
          console.error(`\n\nFOUND PROBLEMATIC PATH: "${str}"`);
          console.error(`Path contains a parameter marker (: or *) without a valid parameter name`);
          console.error(`Stack trace:`);
          console.error(new Error().stack);
          console.error(`\n`);
        }
      }
      
      try {
        return originalParse(str, options);
      } catch (error) {
        console.error(`\n\nERROR IN path-to-regexp.parse()`);
        console.error(`Problematic path: "${str}"`);
        console.error(`Stack trace:`);
        console.error(new Error().stack);
        console.error(`\n`);
        throw error;
      }
    };
  }
  
  return result;
};

// Инициализация Express приложения
const app = express();

// Middleware
app.use(cors({ 
  origin: ['http://localhost:5173', 'tauri-dev://localhost', 'http://localhost:3000', 'http://localhost'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
})); // Расширенная конфигурация CORS для поддержки разных клиентов

// CORS preflight для сложных запросов - FIX: Using a regexp instead of '*' to avoid path-to-regexp error
app.options(/.*/, cors());  // This matches all routes without using '*' character

// Обработка предварительных запросов CORS для всех маршрутов
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

app.use(express.json()); // Парсинг JSON тел запросов
app.use(express.urlencoded({ extended: true })); // Парсинг URL-кодированных тел запросов

// Эндпоинт для проверки здоровья сервера
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Добавляем базовый маршрут для проверки работы сервера
app.get('/', (req, res) => {
  res.json({ message: 'Vyre Backend API работает!' });
});

// Подключение маршрутов - важно: здесь используем только основные файлы маршрутов
const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const serverRoutes = require('./src/routes/serverRoutes');
const messageRoutes = require('./src/routes/messageRoutes'); // Новый маршрут для сообщений

// Используем маршруты из файлов
console.log("DEBUG - Registering auth routes");
app.use('/api/auth', authRoutes); // Маршруты аутентификации будут доступны по /api/auth/...

console.log("DEBUG - Registering chat routes");
app.use('/api/chats', chatRoutes); // Маршруты чатов будут доступны по /api/chats/...

console.log("DEBUG - Registering server routes");
app.use('/api/servers', serverRoutes); // Маршруты серверов будут доступны по /api/servers/...

console.log("DEBUG - Registering message routes");
app.use('/api/messages', messageRoutes); // Маршруты сообщений будут доступны по /api/messages/...

// Добавляем маршрут для получения пользователей отдельно
const { verifyToken } = require('./src/middleware/auth');
const { getDb } = require('./src/db/database');

// Обработчик для получения списка пользователей
app.get('/api/users', verifyToken, (req, res) => {
  const db = getDb();
  
  // Получаем всех пользователей, кроме текущего
  db.all('SELECT id, username, is_online FROM users WHERE id != ?', [req.user.userId], (err, users) => {
    if (err) {
      console.error('Ошибка при получении пользователей:', err.message);
      return res.status(500).json({ message: 'Ошибка сервера при получении пользователей' });
    }
    
    return res.status(200).json(users);
  });
});

// Создание HTTP сервера на основе Express приложения
const server = http.createServer(app);

// Порт сервера
const PORT = process.env.PORT || 3000; // Берем порт из .env или используем 3000 по умолчанию

// Экспорт сервера для использования в других частях приложения (например, Socket.IO)
module.exports = { app, server, express };
