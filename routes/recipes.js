const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');

// Создание рецепта
router.post('/', auth, async (req, res) => {
    try {
        console.log('POST /api/recipes - Request body:', req.body);
        const recipe = new Recipe({
            ...req.body,
            userId: req.user.id
        });
        await recipe.save();
        res.status(201).json(recipe);
    } catch (err) {
        console.error('POST /api/recipes - Error:', err);
        res.status(400).json({ message: err.message });
    }
});

// Получение рецептов пользователя
router.get('/user/:userId', auth, async (req, res) => {
    try {
        console.log(`GET /api/users/${req.params.userId}/recipes - User ID:`, req.user.id);
        const recipes = await Recipe.find({ userId: req.params.userId });
        res.json(recipes);
    } catch (err) {
        console.error('GET /api/users/recipes - Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Удаление рецепта
router.delete('/:id', auth, async (req, res) => {
    try {
        console.log(`DELETE /api/recipes/${req.params.id} - User ID:`, req.user.id);
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            console.log(`Recipe ${req.params.id} not found`);
            return res.status(404).json({ message: 'Рецепт не найден' });
        }
        console.log('Found recipe:', recipe);
        if (recipe.userId.toString() !== req.user.id) {
            console.log(`User ${req.user.id} not authorized to delete recipe ${req.params.id}`);
            return res.status(403).json({ message: 'Вы не можете удалить этот рецепт' });
        }
        await Recipe.deleteOne({ _id: req.params.id });
        console.log(`Recipe ${req.params.id} deleted`);
        res.json({ message: 'Рецепт удалён' });
    } catch (err) {
        console.error(`DELETE /api/recipes/${req.params.id} - Error:`, err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;