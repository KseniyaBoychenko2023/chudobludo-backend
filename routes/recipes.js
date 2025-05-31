const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../cloudinary');

// Настройка multer для хранения файлов в памяти
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 МБ
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения JPEG или PNG'), false);
    }
  }
});

// Создание рецепта
router.post('/', 
  auth,
  upload.fields([
    { name: 'recipeImage', maxCount: 1 },
    { name: 'stepImages', maxCount: 50 }
  ]),
  async (req, res) => {
    try {
      console.log('POST /api/recipes - Request body:', req.body, 'Files:', req.files, 'Author ID:', req.user?.id);
      if (!req.user?.id) {
        console.log('No user ID in req.user');
        return res.status(401).json({ message: 'Пользователь не авторизован' });
      }

      // Парсим JSON-данные из строки (если они отправлены как строка)
      let recipeData = req.body;
      if (typeof recipeData === 'string') {
        recipeData = JSON.parse(recipeData);
      }

      // Загрузка изображения рецепта в Cloudinary
      let recipeImageUrl = '';
      if (req.files.recipeImage && req.files.recipeImage[0]) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: 'recipes' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.files.recipeImage[0].buffer);
        });
        recipeImageUrl = result.secure_url;
      }

      // Загрузка изображений шагов в Cloudinary
      const stepImageUrls = [];
      if (req.files.stepImages) {
        for (const file of req.files.stepImages) {
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              { resource_type: 'image', folder: 'recipe_steps' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(file.buffer);
          });
          stepImageUrls.push(result.secure_url);
        }
      }

      // Формируем объект рецепта
      const recipe = new Recipe({
        title: recipeData.title,
        categories: recipeData.categories,
        description: recipeData.description,
        servings: parseInt(recipeData.servings),
        cookingTime: parseInt(recipeData.cookingTime),
        ingredients: recipeData.ingredients,
        ingredientQuantities: recipeData.ingredientQuantities.map(q => parseFloat(q)),
        ingredientUnits: recipeData.ingredientUnits,
        image: recipeImageUrl,
        steps: recipeData.steps.map((step, index) => ({
          description: step.description,
          image: stepImageUrls[index] || ''
        })),
        author: req.user.id,
        ingredientCount: recipeData.ingredients?.length || 0
      });

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