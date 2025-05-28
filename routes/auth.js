const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ����������� ������ ������������
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        // ���������, ���������� �� ������������ � ����� email
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: '������������ � ����� email ��� ����������' });
        }

        // ��������� ������������ ����
        if (!username || !email || !password) {
            return res.status(400).json({ message: '��� ���� �����������' });
        }

        // ������ ������ ������������
        user = new User({ username, email, password });
        await user.save();

        // ������ payload ��� ������
        const payload = {
            user: {
                id: user.id
            }
        };

        // ���������� �����
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, userId: user._id });
        });
    } catch (err) {
        console.error('������ �����������:', err.message);
        res.status(500).json({ message: '������ �������' });
    }
});

// ���� ������������
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: '�������� ������� ������' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: '�������� ������� ������' });
        }
        // ������ payload ��� ������
        const payload = {
            user: {
                id: user.id
            }
        };
        // ���������� �����
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, userId: user._id });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('������ �������');
    }
});

module.exports = router;