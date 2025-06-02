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
            return res.status(400).json({ message: 'Все поля обязательны' });
        }
        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Пользователь уже существует' });
        }
        const newUser = new User({ username, email, password });
        await newUser.save();
        const token = jwt.sign({ user: { id: newUser.id } }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: newUser._id });
    } catch (err) {
        console.error('Register error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    console.log('POST /api/auth/login - Body:', req.body);
    try {
        const { email, password, code } = req.body;
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

        // Отладка значений
        console.log('User from DB:', { email, isAdmin: user.isAdmin });
        console.log('Admin code check:', { code, expected: process.env.CODE_FOR_ADMIN });

        // Проверяем, является ли пользователь админом
        let isAdmin = false; // По умолчанию всегда false, если код не введён
        if (code) { // Если передан код, проверяем его
            if (!process.env.CODE_FOR_ADMIN) {
                console.error('CODE_FOR_ADMIN is not set in environment variables');
                return res.status(500).json({ message: 'Ошибка сервера: код админа не настроен' });
            }
            const isCodeValid = code.trim() === process.env.CODE_FOR_ADMIN.trim();
            console.log('Code validation result:', isCodeValid);
            if (isCodeValid && user.isAdmin) {
                isAdmin = true;
            } else if (isCodeValid && !user.isAdmin) {
                return res.status(403).json({ message: 'Код верный, но у пользователя нет прав администратора' });
            } else {
                return res.status(403).json({ message: 'Неверный код администратора' });
            }
        }

        const token = jwt.sign(
            { user: { id: user.id, isAdmin } }, // Добавляем isAdmin в токен
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log('Response data:', { token, userId: user._id, isAdmin });
        res.json({ token, userId: user._id, isAdmin });
    } catch (err) {
        console.error('Login error:', err.message, err.stack);
        res.status(500).json({ message: 'Ошибка сервера', error: err.message });
    }
});

module.exports = router;