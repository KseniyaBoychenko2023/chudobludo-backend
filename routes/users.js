const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

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
    if (req.user.id !== req.params.id && !req.user.isAdmin) {
      console.log(`Access denied for user ${req.user.id} (isAdmin: ${req.user.isAdmin}) to fetch user ${req.params.id}`);
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    const user = await User.findById(req.params.id).select('username email createdRecipes favorites isAdmin');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    const publishedRecipesCount = await Recipe.countDocuments({
      _id: { $in: user.createdRecipes },
      status: 'published'
    });
    return res.json({
       username: user.username, 
       email: user.email, 
       recipeCount: publishedRecipesCount, 
       favoritesCount: user.favorites.length, 
       favorites: user.favorites, 
       isAdmin: user.isAdmin 
    });
  } catch (err) {
    console.error('GET /api/users/:id — Error:', err.message);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.get('/:id/favorites', auth, async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя' });
    }
    const user = await User.findById(userId).populate('favorites');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    return res.json(user.favorites);
  } catch (err) {
    console.error('GET /api/users/:id/favorites — Error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
});

router.put('/:id/favorites/:recipeId', auth, async (req, res) => {
  try {
    const userId   = req.params.id;
    const recipeId = req.params.recipeId;
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(recipeId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя или рецепта' });
    }
    const recipe = await Recipe.findById(recipeId);
    if (!recipe || recipe.status !== 'published') {
      return res.status(404).json({ message: 'Рецепт не найден или не опубликован' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const alreadyFavorited = user.favorites.some(favId => favId.toString() === recipeId);
    if (alreadyFavorited) {
      return res.status(400).json({ message: 'Рецепт уже в избранном' });
    }

    user.favorites.push(recipeId);
    await user.save();

    return res.json({ message: 'Рецепт добавлен в избранное', favoritesCount: user.favorites.length });
  } catch (err) {
    console.error('PUT /api/users/:id/favorites/:recipeId — Error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/:id/favorites/:recipeId', auth, async (req, res) => {
  try {
    const userId   = req.params.id;
    const recipeId = req.params.recipeId;
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(recipeId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя или рецепта' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    const index = user.favorites.findIndex(favId => favId.toString() === recipeId);
    if (index === -1) {
      return res.status(400).json({ message: 'Рецепт не найден в избранном' });
    }

    user.favorites.splice(index, 1);
    await user.save();

    return res.json({ message: 'Рецепт удалён из избранного', favoritesCount: user.favorites.length });
  } catch (err) {
    console.error('DELETE /api/users/:id/favorites/:recipeId — Error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id/favorites/count', auth, async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя' });
    }

    const user = await User.findById(userId).select('favorites');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    return res.json({ favoritesCount: user.favorites.length });
  } catch (err) {
    console.error('GET /api/users/:id/favorites/count — Error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router; 
