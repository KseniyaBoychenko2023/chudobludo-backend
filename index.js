const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cloudinary = require('./cloudinary');
const recipeRoutes = require('./routes/recipes');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

dotenv.config();

const app = express();

console.log('Node.js version:', process.version);
console.log('Environment Variables:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
    api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : 'Not set',
    mongo_uri: process.env.MONGO_URI ? 'Set' : 'Not set',
    jwt_secret: process.env.JWT_SECRET ? 'Set' : 'Not set',
    port: process.env.PORT || 5000,
});
console.log('Cloudinary Config:', cloudinary.config());

app.use(cors({
    origin: ['http://localhost:8080', 'https://chudobludo.fun'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '50kb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin} - User-Agent: ${req.headers['user-agent']} - Body:`, req.body);
    next();
});

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.status(200).send('Recipe API OK');
});

app.use((err, req, res, next) => {
    console.error('Server error:', err.message, err.stack);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.log('Ошибка парсинга JSON:', err.message);
        return res.status(400).json({ message: 'Ошибка парсинга JSON', details: err.message });
    }
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));