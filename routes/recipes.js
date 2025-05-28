const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');

// Создание рецепта
router.post('/', auth, async (req, res) => {
    try {
        const recipe = new Recipe({
            ...req.body,
            userId: req.user.id
        });
        await recipe.save();
        res.status(201).json(recipe);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Получение рецептов пользователя
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const recipes = await Recipe.find({ userId: req.params.userId });
        res.json(recipes);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Удаление рецепта
router.delete('/:id', auth, async (req, res) => {
    try {
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            return res.status(404).json({ message: 'Рецепт не найден' });
        }
        if (recipe.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Вы не можете удалить этот рецепт' });
        }
        await Recipe.deleteOne({ _id: req.params.id });
        res.json({ message: 'Рецепт удалён' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;