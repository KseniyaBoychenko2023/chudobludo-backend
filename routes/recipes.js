const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');

// Создание рецепта
router.post('/', auth, async (req, res) => {
    try {
        console.log('POST /api/recipes - Request body:', req.body, 'Author ID:', req.user?.id);
        if (!req.user?.id) {
            console.log('No user ID in req.user');
            return res.status(401).json({ message: 'Пользователь не авторизован' });
        }
        const recipeData = {
            ...req.body,
            author: req.user.id,
            ingredientCount: req.body.ingredients?.length || 0
        };
        const recipe = new Recipe(recipeData);
        await recipe.save();
        res.status(201).json(recipe);
    } catch (err) {
        console.error('POST /api/recipes - Error:', err.message, err.stack);
        res.status(400).json({ message: err.message });
    }
});

// Получение рецептов пользователя
router.get('/user/:userId', auth, async (req, res) => {
    try {
        console.log(`GET /api/users/${req.params.userId}/recipes - Author ID:`, req.user?.id);
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            console.log(`Invalid userId: ${req.params.userId}`);
            return res.status(400).json({ message: 'Неверный ID пользователя' });
        }
        const recipes = await Recipe.find({ author: req.params.userId });
        res.json(recipes);
    } catch (err) {
        console.error('GET /api/users/recipes - Error:', err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

// Удаление рецепта
router.delete('/:id', auth, async (req, res) => {
    try {
        console.log(`DELETE /api/recipes/${req.params.id} - Author ID:`, req.user?.id);
        if (!req.user?.id) {
            console.log('No user ID in req.user');
            return res.status(401).json({ message: 'Пользователь не авторизован' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log(`Invalid recipeId: ${req.params.id}`);
            return res.status(400).json({ message: 'Неверный ID рецепта' });
        }
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            console.log(`Recipe ${req.params.id} not found`);
            return res.status(404).json({ message: 'Рецепт не найден' });
        }
        console.log('Found recipe:', recipe);
        if (!recipe.author) {
            console.log(`Recipe ${req.params.id} has no author`);
            return res.status(400).json({ message: 'Рецепт не имеет автора' });
        }
        if (recipe.author.toString() !== req.user.id) {
            console.log(`User ${req.user.id} not authorized to delete recipe ${req.params.id}`);
            return res.status(403).json({ message: 'Вы не можете удалить этот рецепт' });
        }
        await Recipe.deleteOne({ _id: req.params.id });
        console.log(`Recipe ${req.params.id} deleted`);
        res.json({ message: 'Рецепт удалён' });
    } catch (err) {
        console.error(`DELETE /api/recipes/${req.params.id} - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;