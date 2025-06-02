const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    try {
        const authHeader = req.header('Authorization');
        console.log('Auth middleware - Authorization header:', authHeader);
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Auth middleware - No token provided');
            return res.status(401).json({ message: 'Токен не предоставлен' });
        }
        const token = authHeader.replace('Bearer ', '');
        console.log('Received Authorization header:', token);
        console.log('Auth middleware - Token:', token);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Auth middleware - Decoded:', decoded);
        if (!decoded.user?.id) { // Извлекаем user.id
            console.log('Auth middleware - No user ID in decoded token');
            return res.status(401).json({ message: 'Неверный токен' });
        }
        req.user = { 
            id: decoded.user.id,
            isAdmin: decoded.user.isAdmin || false // Извлекаем isAdmin из токена
        };
        next();
    } catch (err) {
        console.error('Auth middleware - Error:', err.message);
        res.status(401).json({ message: 'Пожалуйста, авторизуйтесь' });
    }
};