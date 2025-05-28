const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    try {
        const authHeader = req.header('Authorization');
        console.log('Auth middleware - Authorization header:', authHeader);
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('No token provided');
        }
        const token = authHeader.replace('Bearer ', '');
        console.log('Auth middleware - Token:', token);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Auth middleware - Decoded:', decoded);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Auth middleware - Error:', err.message);
        res.status(401).json({ message: 'Пожалуйста, авторизуйтесь' });
    }
};