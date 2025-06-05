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
    const user = await User.findById(req.params.id).select('username email createdRecipes favorites isAdmin');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    return res.json({
       username: user.username, 
       email: user.email, 
       recipeCount: user.createdRecipes.length, 
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

// --------------------------------------------------
// Добавить рецепт в избранное: PUT /api/users/:id/favorites/:recipeId
// --------------------------------------------------
router.put('/:id/favorites/:recipeId', auth, async (req, res) => {
  try {
    const userId   = req.params.id;
    const recipeId = req.params.recipeId;

    // 1) Проверяем, что текущий пользователь либо тот же, либо админ
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    // 2) Проверяем корректность ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(recipeId)) {
      return res.status(400).json({ message: 'Неверный ID пользователя или рецепта' });
    }

    // 3) Убедимся, что рецепт существует и статус = published
    const recipe = await Recipe.findById(recipeId);
    if (!recipe || recipe.status !== 'published') {
      return res.status(404).json({ message: 'Рецепт не найден или не опубликован' });
    }

    // 4) Добавляем в favorites, если ещё нет
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

// --------------------------------------------------
// Убрать рецепт из избранного: DELETE /api/users/:id/favorites/:recipeId
// --------------------------------------------------
router.delete('/:id/favorites/:recipeId', auth, async (req, res) => {
  try {
    const userId   = req.params.id;
    const recipeId = req.params.recipeId;

    // 1) Проверяем права (тот же пользователь или админ)
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

    // 2) Проверяем, что рецепт действительно в массиве favorites
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

// --------------------------------------------------
// Получить количество избранных: GET /api/users/:id/favorites/count
// --------------------------------------------------
router.get('/:id/favorites/count', auth, async (req, res) => {
  try {
    const userId = req.params.id;

    // Проверяем права: либо сам пользователь, либо админ
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
