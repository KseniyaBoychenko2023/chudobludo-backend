// C:\Users\Kseniia\Desktop\pract\Backend\chudobludo-backend\index.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const recipeRoutes = require('./routes/recipes');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

dotenv.config();

const app = express();

// Логирование
console.log('Node.js version:', process.version);
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');

// CORS
app.use(cors({
    origin: ['http://localhost:8080', 'https://chudobludo.fun', 'https://chudobludo.ru'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
}));

// Парсинг JSON
app.use(express.json({ limit: '50kb' }));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin} - User-Agent: ${req.headers['user-agent']} - Body:`, req.body);
    next();
});

// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Маршруты
app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.send('Recipe API is running');
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Server error:', err.message, err.stack);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.log('JSON parse error:', err.message);
        return res.status(400).json({ message: 'Ошибка парсинга JSON', details: err.message });
    }
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));