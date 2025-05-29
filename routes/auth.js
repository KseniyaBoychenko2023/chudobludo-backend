const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req, res) => {
    console.log('POST /api/auth/register - Body:', req.body);
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).json({ message: 'Все поля обязательны!' });
        }
        let user = await User.findOne({ email });
        if (user) {
            console.log('User already exists:', email);
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }
        user = new User({ username, email, password });
        await user.save();
        console.log('User registered:', user._id);
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: user._id });
    } catch (err) {
        console.error('Register error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    console.log('POST /api/auth/login - Body:', req.body);
    try {
        if (!req.body) {
            console.log('Request body is undefined');
            return res.status(400).json({ message: 'Тело запроса отсутствует' });
        }
        const { email, password } = req.body;
        if (!email || !password) {
            console.log('Missing email or password');
            return res.status(400).json({ message: 'Email и пароль обязательны' });
        }
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found:', email);
            return res.status(400).json({ message: 'Неверные учетные данные' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Password mismatch for:', email);
            return res.status(400).json({ message: 'Неверные учетные данные' });
        }
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log('Login successful for:', email);
        res.json({ token, userId: user._id });
    } catch (err) {
        console.error('Login error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

module.exports = router;