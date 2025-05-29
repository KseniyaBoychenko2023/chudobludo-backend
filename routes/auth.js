// C:\Users\Kseniia\Desktop\pract\Backend\chudobludo-backend\routes\auth.js
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
            return res.status(400).json({ message: 'Все поля обязательны!' });
        }
        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }
        const newUser = new User({ username, email, password });
        await newUser.save();
        const payload = { user: { id: newUser.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: newUser._id });
    } catch (err) {
        console.error('Register error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    console.log('POST /api/auth/login - Body:', req.body);
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email и пароль обязательны' });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Неверные учетные данные' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверные учетные данные' });
        }
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: user._id });
    } catch (err) {
        console.error('Login error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

module.exports = router;