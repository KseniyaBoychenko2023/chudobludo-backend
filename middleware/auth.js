const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

module.exports = async function (req, res, next) {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded); 

        const userId = decoded.user?.id || decoded.id;
        if (!userId) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }

        req.user = await User.findById(userId).select('-password');
        if (!req.user) {
            return res.status(401).json({ message: 'User not found' });
        }

        next();
    } catch (err) {
        console.error('Token error:', err.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};