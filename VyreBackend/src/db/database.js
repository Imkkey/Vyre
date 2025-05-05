const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к файлу базы данных
const DB_PATH = path.resolve(__dirname, '../../vyre.db');

let db = null; // Переменная для хранения экземпляра базы данных

// Функция для получения экземпляра базы данных
const getDb = () => {
    if (!db) {
        // Открытие или создание базы данных
        db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Ошибка при подключении к базе данных:', err.message);
            } else {
                console.log('Подключено к базе данных SQLite.');
                // При первом подключении создаем таблицы, если их нет
                initializeDatabase(() => {
                    console.log('Инициализация базы данных завершена');
                });
            }
        });
    }
    return db;
};

// Функция для создания таблиц
const initializeDatabase = (callback) => {
    // Используем напрямую db, а не вызываем getDb() снова, чтобы избежать рекурсии
    db.serialize(() => {
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_online INTEGER DEFAULT 0
        )`);

        // Таблица серверов
        db.run(`CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT 'default',
            owner_id INTEGER NOT NULL,
            invite_code TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )`);

        // Таблица для связи пользователей и серверов (многие ко многим)
        db.run(`CREATE TABLE IF NOT EXISTS server_members (
            user_id INTEGER,
            server_id INTEGER,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, server_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (server_id) REFERENCES servers(id)
        )`);

        // Таблица чатов/серверов (теперь чаты будут привязаны к серверам)
        db.run(`CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'ТЕКСТОВЫЕ КАНАЛЫ',
            server_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id)
        )`);

        // Таблица сообщений
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            user_id INTEGER,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Таблица для связи пользователей и чатов (многие ко многим)
         db.run(`CREATE TABLE IF NOT EXISTS user_chats (
            user_id INTEGER,
            chat_id INTEGER,
            PRIMARY KEY (user_id, chat_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (chat_id) REFERENCES chats(id)
        )`);

        console.log('Проверка и создание таблиц завершены.');
        
        // Проверяем структуру таблицы chats на наличие сервисных полей
        db.all("PRAGMA table_info(chats)", (err, rows) => {
            if (err) {
                console.error('Ошибка при проверке структуры таблицы chats:', err.message);
                return;
            }
            
            // Проверяем наличие колонки server_id
            const hasServerId = rows.some(row => row.name === 'server_id');
            if (!hasServerId) {
                console.log('Колонка server_id отсутствует в таблице chats. Добавляем её...');
                db.run('ALTER TABLE chats ADD COLUMN server_id INTEGER', (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении колонки server_id:', err.message);
                    } else {
                        console.log('Колонка server_id успешно добавлена в таблицу chats');
                    }
                });
            } else {
                console.log('Колонка server_id уже существует в таблице chats');
            }
            
            // Проверяем наличие колонки is_direct
            const hasIsDirect = rows.some(row => row.name === 'is_direct');
            if (!hasIsDirect) {
                console.log('Колонка is_direct отсутствует в таблице chats. Добавляем её...');
                db.run('ALTER TABLE chats ADD COLUMN is_direct INTEGER DEFAULT 0', (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении колонки is_direct:', err.message);
                    } else {
                        console.log('Колонка is_direct успешно добавлена в таблицу chats');
                    }
                });
            } else {
                console.log('Колонка is_direct уже существует в таблице chats');
            }
            
            // Проверяем наличие колонки category
            const hasCategory = rows.some(row => row.name === 'category');
            if (!hasCategory) {
                db.run('ALTER TABLE chats ADD COLUMN category TEXT DEFAULT "ТЕКСТОВЫЕ КАНАЛЫ"', (err) => {
                    if (err) {
                        console.error('Ошибка при добавлении колонки category:', err.message);
                    } else {
                        console.log('Колонка category успешно добавлена в таблицу chats');
                    }
                });
            }
        });
        
        // Проверяем, существует ли Global чат
        db.get('SELECT * FROM chats WHERE name = "Global"', (err, chat) => {
            if (err) {
                console.error('Ошибка при проверке Global чата:', err.message);
                return;
            }
            
            if (!chat) {
                // Создаем Global чат, если его нет
                db.run('INSERT INTO chats (name, category) VALUES ("Global", "ТЕКСТОВЫЕ КАНАЛЫ")', function(err) {
                    if (err) {
                        console.error('Ошибка при создании Global чата:', err.message);
                        return;
                    }
                    console.log('Global чат успешно создан с ID:', this.lastID);
                    
                    // Добавляем всех существующих пользователей в Global чат
                    db.all('SELECT id FROM users', (err, users) => {
                        if (err) {
                            console.error('Ошибка при получении пользователей:', err.message);
                            return;
                        }
                        
                        const globalChatId = this.lastID;
                        
                        users.forEach(user => {
                            db.run('INSERT INTO user_chats (user_id, chat_id) VALUES (?, ?)', 
                                [user.id, globalChatId], 
                                (err) => {
                                    if (err) {
                                        console.error(`Ошибка при добавлении пользователя ${user.id} в Global чат:`, err.message);
                                    }
                                }
                            );
                        });
                    });
                });
                
                // Создаем чат для мемов
                db.run('INSERT INTO chats (name, category) VALUES ("мемы", "ТЕКСТОВЫЕ КАНАЛЫ")', function(err) {
                    if (err) {
                        console.error('Ошибка при создании чата мемов:', err.message);
                    } else {
                        console.log('Чат мемов успешно создан с ID:', this.lastID);
                    }
                });
                
                // Создаем чат для клипов
                db.run('INSERT INTO chats (name, category) VALUES ("клипы-и-основные-моменты", "ТЕКСТОВЫЕ КАНАЛЫ")', function(err) {
                    if (err) {
                        console.error('Ошибка при создании чата клипов:', err.message);
                    } else {
                        console.log('Чат клипов успешно создан с ID:', this.lastID);
                    }
                });
                
                // Создаем голосовой канал
                db.run('INSERT INTO chats (name, category) VALUES ("Гений", "ГОЛОСОВЫЕ КАНАЛЫ")', function(err) {
                    if (err) {
                        console.error('Ошибка при создании голосового канала:', err.message);
                    } else {
                        console.log('Голосовой канал успешно создан с ID:', this.lastID);
                    }
                });
            } else {
                console.log('Global чат уже существует с ID:', chat.id);
                
                // Проверяем наличие колонки category в таблице chats и добавляем её, если отсутствует
                db.all("PRAGMA table_info(chats)", (err, rows) => {
                    if (err) {
                        console.error('Ошибка при проверке структуры таблицы chats:', err.message);
                        return;
                    }
                    
                    // Если колонки last_active нет в таблице users, добавляем ее
                    db.all("PRAGMA table_info(users)", (err, userRows) => {
                        if (err) {
                            console.error('Ошибка при проверке структуры таблицы users:', err.message);
                            return;
                        }
                        
                        const hasLastActive = userRows.some(row => row.name === 'last_active');
                        if (!hasLastActive) {
                            // В SQLite нельзя добавить колонку с DEFAULT CURRENT_TIMESTAMP,
                            // поэтому добавляем без DEFAULT и затем обновляем существующие записи
                            db.run('ALTER TABLE users ADD COLUMN last_active DATETIME', (err) => {
                                if (err) {
                                    console.error('Ошибка при добавлении колонки last_active:', err.message);
                                } else {
                                    console.log('Колонка last_active успешно добавлена в таблицу users');
                                    
                                    // Обновляем существующие записи, устанавливая текущее время
                                    db.run('UPDATE users SET last_active = CURRENT_TIMESTAMP', (err) => {
                                        if (err) {
                                            console.error('Ошибка при обновлении значений last_active:', err.message);
                                        } else {
                                            console.log('Значения last_active успешно обновлены для всех пользователей');
                                        }
                                    });
                                }
                            });
                        }
                        
                        // Проверяем наличие колонки is_online в таблице users
                        const hasIsOnline = userRows.some(row => row.name === 'is_online');
                        if (!hasIsOnline) {
                            db.run('ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0', (err) => {
                                if (err) {
                                    console.error('Ошибка при добавлении колонки is_online:', err.message);
                                } else {
                                    console.log('Колонка is_online успешно добавлена в таблицу users');
                                    
                                    // Инициализируем значения is_online для всех существующих пользователей
                                    db.run('UPDATE users SET is_online = 0', (err) => {
                                        if (err) {
                                            console.error('Ошибка при инициализации значений is_online:', err.message);
                                        } else {
                                            console.log('Значения is_online успешно установлены для всех пользователей');
                                        }
                                    });
                                }
                            });
                        }
                    });
                    
                    const hasCategory = rows.some(row => row.name === 'category');
                    if (!hasCategory) {
                        db.run('ALTER TABLE chats ADD COLUMN category TEXT DEFAULT "ТЕКСТОВЫЕ КАНАЛЫ"', (err) => {
                            if (err) {
                                console.error('Ошибка при добавлении колонки category:', err.message);
                            } else {
                                console.log('Колонка category успешно добавлена в таблицу chats');
                            }
                        });
                    }
                });
            }
        });
    });
    console.log('База данных инициализирована');
                
    // Создаем тестовые данные, если их еще нет
    populateTestData();
                
    // Вызываем callback для уведомления, что база данных готова
    if (callback) callback(null, db);
};

// Функция для заполнения тестовых данных
const populateTestData = () => {
    // ... код функции populateTestData
};

// Вспомогательная функция для добавления пользователя в стандартные каналы
const addToStandardChannels = (userId, callback) => {
    const db = getDb();
    db.all('SELECT id FROM chats WHERE name IN ("мемы", "клипы-и-основные-моменты", "Гений")', (err, channels) => {
        if (err) {
            console.error('Ошибка при поиске стандартных каналов:', err.message);
            if (callback) callback(err);
            return;
        }
        
        // Счетчик для отслеживания завершения всех операций
        let pendingOperations = channels.length;
        let hasError = null;
        
        // Если нет каналов, вызываем колбэк сразу
        if (pendingOperations === 0) {
            if (callback) callback(null);
            return;
        }
        
        channels.forEach(channel => {
            // Проверяем, существует ли уже запись для этого пользователя и канала
            db.get('SELECT 1 FROM user_chats WHERE user_id = ? AND chat_id = ?', [userId, channel.id], (err, exists) => {
                if (err) {
                    console.error(`Ошибка при проверке существования записи в user_chats для канала ${channel.id}:`, err.message);
                    hasError = err;
                    if (--pendingOperations === 0 && callback) callback(hasError);
                    return;
                }
                
                // Если запись уже существует, пропускаем вставку
                if (exists) {
                    console.log(`Пользователь ${userId} уже добавлен в канал ${channel.id}`);
                    if (--pendingOperations === 0 && callback) callback(hasError);
                    return;
                }
                
                // Если записи нет, добавляем пользователя в канал
                db.run('INSERT INTO user_chats (user_id, chat_id) VALUES (?, ?)', 
                    [userId, channel.id], 
                    (err) => {
                        if (err) {
                            console.error(`Ошибка при добавлении пользователя ${userId} в канал ${channel.id}:`, err.message);
                            hasError = err;
                        } else {
                            console.log(`Пользователь ${userId} успешно добавлен в канал ${channel.id}`);
                        }
                        
                        if (--pendingOperations === 0 && callback) callback(hasError);
                    }
                );
            });
        });
    });
};

// Экспорт функций для работы с БД
module.exports = {
    getDb,
    initializeDatabase,
    addToStandardChannels
};