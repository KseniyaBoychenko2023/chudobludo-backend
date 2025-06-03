const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');

const User = require('../models/User');

router.get('/:id/recipes', auth, async (req, res) => {
    try {
        if (req.user.id !== req.params.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const recipes = await Recipe.find({ author: req.params.id });
        res.json(recipes);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', auth, async (req, res) => {
  try {
    // Разрешаем доступ либо самому пользователю, либо администратору
    if (req.user.id !== req.params.id && !req.user.isAdmin) {
      console.log(`Access denied for user ${req.user.id} (isAdmin: ${req.user.isAdmin}) to fetch user ${req.params.id}`);
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    const user = await User.findById(req.params.id).select('username email createdRecipes');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    return res.json({ username: user.username, email: user.email, recipeCount: user.createdRecipes.length, isAdmin: user.isAdmin });
  } catch (err) {
    console.error('GET /api/users/:id — Error:', err.message);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router; 
