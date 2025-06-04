const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../cloudinary');
const User = require('../models/User');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения JPEG или PNG'), false);
        }
    },
});

router.post(
    '/',
    auth,
    upload.fields([
        { name: 'recipeImage', maxCount: 1 },
        { name: 'stepImages', maxCount: 50 },
    ]),
    async (req, res) => {
        try {
            console.log('POST /api/recipes - Request body:', req.body, 'Files:', req.files, 'Author ID:', req.user?.id);
            if (!req.user?.id) return res.status(401).json({ message: 'Пользователь не авторизован' });

            let recipeData = req.body.recipeData;
            if (!recipeData) return res.status(400).json({ message: 'Данные рецепта отсутствуют' });
            if (typeof recipeData === 'string') {
                try { recipeData = JSON.parse(recipeData); } 
                catch (err) { return res.status(400).json({ message: 'Неверный формат данных' }); }
            }

            const { title, ingredients, ingredientQuantities, ingredientUnits, steps } = recipeData;
            if (!title || !Array.isArray(ingredients) || !Array.isArray(ingredientQuantities) || !Array.isArray(ingredientUnits) || !Array.isArray(steps)) {
                return res.status(400).json({ message: 'Неверные данные рецепта' });
            }
            if (ingredients.length !== ingredientQuantities.length || ingredients.length !== ingredientUnits.length) {
                return res.status(400).json({ message: 'Несоответствие длины массивов ингредиентов, количеств и единиц' });
            }

            let recipeImageUrl = '';
            if (req.files && req.files.recipeImage && req.files.recipeImage[0]) {
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'recipes' }, (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }).end(req.files.recipeImage[0].buffer);
                });
                recipeImageUrl = result.secure_url;
                console.log('Recipe image uploaded:', recipeImageUrl);
            }

            const stepImageUrls = Array(steps.length).fill('');
            if (req.files && req.files.stepImages) {
                for (const file of req.files.stepImages) {
                    // Извлекаем индекс из fieldname (stepImages[0], stepImages[2] и т.д.)
                    const match = file.fieldname.match(/stepImages\[(\d+)\]/);
                    if (match) {
                        const index = parseInt(match[1]);
                        if (index < steps.length) {
                            const result = await new Promise((resolve, reject) => {
                                cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'recipe_steps' }, (error, result) => {
                                    if (error) return reject(error);
                                    resolve(result);
                                }).end(file.buffer);
                            });
                            stepImageUrls[index] = result.secure_url;
                            console.log(`Step ${index + 1} image uploaded: ${stepImageUrls[index]}`);
                        }
                    }
                }
            }

            const recipe = new Recipe({
                title: recipeData.title,
                categories: recipeData.categories || [],
                description: recipeData.description || '',
                servings: parseInt(recipeData.servings) || 1,
                cookingTime: parseInt(recipeData.cookingTime) || 0,
                ingredients,
                ingredientQuantities: ingredientQuantities.map(q => parseFloat(q) || 0),
                ingredientUnits,
                image: recipeImageUrl,
                steps: steps.map((step, index) => ({
                    description: step.description || '',
                    image: stepImageUrls[index] || ''
                })),
                author: req.user.id,
                status: 'pending'
            });

            console.log('Recipe object before save:', recipe.toJSON());
            await recipe.save();

            await User.findByIdAndUpdate(req.user.id, { $push: { createdRecipes: recipe._id } });

            res.status(201).json(recipe);
        } catch (err) {
            console.error('POST /api/recipes - Error:', err.message, err.stack);
            res.status(500).json({ message: 'Внутренняя ошибка сервера', error: err.message });
        }
    }
);

router.get('/user/all', auth, async (req, res) => {
    try {
        console.log(`GET /api/recipes/user/all - Author ID:`, req.user?.id);
        if (!req.user.isAdmin) {
            console.log(`User ${req.user.id} is not an admin`);
            return res.status(403).json({ message: 'Только администраторы могут просматривать все рецепты' });
        }

        const status = req.query.status;
        if (!['pending', 'published', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Неверный статус' });
        }
        
        const recipes = await Recipe.find({ status: status });
        res.json(recipes);
    } catch (err) {
        console.error('GET /api/recipes/user/all - Error:', err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

router.get('/user/:userId', auth, async (req, res) => {
    try {
        console.log(`GET /api/recipes/user/${req.params.userId} - Author ID:`, req.user?.id);
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            console.log(`Invalid userId: ${req.params.userId}`);
            return res.status(400).json({ message: 'Неверный ID пользователя' });
        }
        const recipes = await Recipe.find({ author: req.params.userId });
        res.json(recipes);
    } catch (err) {
        console.error('GET /api/recipes/user - Error:', err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

// Новый маршрут для получения рецепта по ID
router.get('/:id', auth, async (req, res) => {
    try {
        console.log(`GET /api/recipes/${req.params.id} - User ID:`, req.user?.id);
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

        // Проверка прав доступа: автор, админ или опубликованный рецепт
        if (recipe.author.toString() !== req.user.id && !req.user.isAdmin && recipe.status !== 'published') {
            console.log(`User ${req.user.id} not authorized to view recipe ${req.params.id}`);
            return res.status(403).json({ message: 'Вы не можете просматривать этот рецепт' });
        }

        res.json(recipe);
    } catch (err) {
        console.error(`GET /api/recipes/${req.params.id} - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

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
        if (recipe.author.toString() !== req.user.id && !req.user.isAdmin) {
            console.log(`User ${req.user.id} not authorized to delete recipe ${req.params.id}`);
            return res.status(403).json({ message: 'Вы не можете удалить этот рецепт' });
        }
        if (recipe.image) {
            const publicId = recipe.image.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`recipes/${publicId}`);
        }
        for (const step of recipe.steps) {
            if (step.image) {
                const publicId = step.image.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`recipe_steps/${publicId}`);
            }
        }
        await Recipe.deleteOne({ _id: req.params.id });

        // Удаляем ID рецепта из массива createdRecipes пользователя
        await User.findByIdAndUpdate(
            req.user.id,
            { $pull: { createdRecipes: req.params.id } },
            { new: true }
        );
        console.log(`Recipe ${req.params.id} removed from user's createdRecipes`);

        console.log(`Recipe ${req.params.id} deleted`);
        res.json({ message: 'Рецепт удалён' });
    } catch (err) {
        console.error(`DELETE /api/recipes/${req.params.id} - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

router.put('/:id/approve', auth, async (req, res) => {
    try {
        console.log(`PUT /api/recipes/${req.params.id}/approve - Author ID:`, req.user?.id);
        if (!req.user?.id) {
            console.log('No user ID in req.user');
            return res.status(401).json({ message: 'Пользователь не авторизован' });
        }
        if (!req.user.isAdmin) {
            console.log(`User ${req.user.id} is not an admin`);
            return res.status(403).json({ message: 'Только администраторы могут одобрять рецепты' });
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
        if (recipe.status === 'published') {
            return res.status(400).json({ message: 'Рецепт уже опубликован' });
        }
        recipe.status = 'published';
        await recipe.save();
        console.log(`Recipe ${req.params.id} approved and set to published`);
        res.json({ message: 'Рецепт одобрен', recipe });
    } catch (err) {
        console.error(`PUT /api/recipes/${req.params.id}/approve - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

router.put('/:id/reject', auth, async (req, res) => {
    try {
        console.log(`PUT /api/recipes/${req.params.id}/reject - Author ID:`, req.user?.id);
        if (!req.user?.id) {
            console.log('No user ID in req.user');
            return res.status(401).json({ message: 'Пользователь не авторизован' });
        }
        if (!req.user.isAdmin) {
            console.log(`User ${req.user.id} is not an admin`);
            return res.status(403).json({ message: 'Только администраторы могут отклонять рецепты' });
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
        if (recipe.status === 'rejected') {
            return res.status(400).json({ message: 'Рецепт уже отклонён' });
        }
        if (recipe.status === 'published') {
            return res.status(400).json({ message: 'Рецепт уже опубликован' });
        }
        recipe.status = 'rejected';
        await recipe.save();
        console.log(`Recipe ${req.params.id} rejected and set to rejected`);
        res.json({ message: 'Рецепт отклонён', recipe });
    } catch (err) {
        console.error(`PUT /api/recipes/${req.params.id}/reject - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

router.put(
    '/:id/reconsider',
    auth,
    async (req, res) => {
        try {
            console.log(`PUT /api/recipes/${req.params.id}/reconsider - Author ID:`, req.user?.id);
            if (!req.user?.id) {
                console.log('No user ID in req.user');
                return res.status(401).json({ message: 'Пользователь не авторизован' });
            }
            if (!req.user.isAdmin) {
                console.log(`User ${req.user.id} is not an admin`);
                return res.status(403).json({ message: 'Только администраторы могут возвращать рецепты на рассмотрение' });
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
            if (recipe.status !== 'rejected') {
                return res.status(400).json({ message: 'Рецепт не находится в статусе "отклонён"' });
            }
            recipe.status = 'pending';
            await recipe.save();
            console.log(`Recipe ${req.params.id} set to pending for reconsideration`);
            res.json({ message: 'Рецепт возвращён на рассмотрение', recipe });
        } catch (err) {
            console.error(`PUT /api/recipes/${req.params.id}/reconsider - Error:`, err.message, err.stack);
            res.status(500).json({ message: err.message });
        }
    }
);

router.put(
    '/:id',
    auth,
    upload.fields([
        { name: 'recipeImage', maxCount: 1 },
        { name: 'stepImages', maxCount: 50 },
    ]),
    async (req, res) => {
        try {
            console.log(`PUT /api/recipes/${req.params.id} - User ID:`, req.user?.id);
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

            if (recipe.author.toString() !== req.user.id && !req.user.isAdmin) {
                console.log(`User ${req.user.id} not authorized to edit recipe ${req.params.id}`);
                return res.status(403).json({ message: 'Вы не можете редактировать этот рецепт' });
            }

            let recipeData = req.body.recipeData;
            if (!recipeData) {
                console.log('recipeData is missing');
                return res.status(400).json({ message: 'Данные рецепта отсутствуют' });
            }
            if (typeof recipeData === 'string') {
                try {
                    recipeData = JSON.parse(recipeData);
                } catch (err) {
                    console.log('JSON parse error:', err);
                    return res.status(400).json({ message: 'Неверный формат данных' });
                }
            }

            // Валидация
            const { title, categories, description, servings, cookingTime, ingredients, ingredientQuantities, ingredientUnits, steps, removeRecipeImage } = recipeData;

            if (!title || title.length > 50) {
                return res.status(400).json({ message: 'Название рецепта должно быть от 1 до 50 символов' });
            }
            if (description && description.length > 1000) {
                return res.status(400).json({ message: 'Описание рецепта должно быть до 1000 символов' });
            }
            if (!Array.isArray(categories) || categories.length === 0) {
                return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
            }
            const validCategories = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack'];
            if (!categories.every(cat => validCategories.includes(cat))) {
                return res.status(400).json({ message: 'Недопустимая категория' });
            }
            if (typeof servings !== 'number' || servings < 1 || servings > 100) {
                return res.status(400).json({ message: 'Количество порций должно быть от 1 до 100' });
            }
            if (typeof cookingTime !== 'number' || cookingTime < 0 || cookingTime > 1000) {
                return res.status(400).json({ message: 'Время приготовления должно быть от 0 до 1000 минут' });
            }
            if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > 100) {
                return res.status(400).json({ message: 'Должен быть хотя бы один ингредиент, но не более 100' });
            }
            if (!Array.isArray(ingredientQuantities) || ingredientQuantities.length !== ingredients.length) {
                return res.status(400).json({ message: 'Количество ингредиентов не соответствует их числу' });
            }
            if (!Array.isArray(ingredientUnits) || ingredientUnits.length !== ingredients.length) {
                return res.status(400).json({ message: 'Единицы измерения не соответствуют числу ингредиентов' });
            }
            if (!Array.isArray(steps) || steps.length === 0 || steps.length > 100) {
                return res.status(400).json({ message: 'Должен быть хотя бы один шаг, но не более 100' });
            }

            for (let i = 0; i < ingredients.length; i++) {
                if (!ingredients[i] || ingredients[i].length > 50) {
                    return res.status(400).json({ message: `Ингредиент ${i + 1} должен быть от 1 до 50 символов` });
                }
                if (typeof ingredientQuantities[i] !== 'number' || ingredientQuantities[i] < 0 || ingredientQuantities[i] > 1000) {
                    return res.status(400).json({ message: `Количество для ингредиента ${i + 1} должно быть от 0 до 1000` });
                }
                if (!['г', 'кг', 'мл', 'л', 'шт', 'ст', 'стл', 'чл', 'пв'].includes(ingredientUnits[i])) {
                    return res.status(400).json({ message: `Недопустимая единица измерения для ингредиента ${i + 1}` });
                }
            }

            for (let i = 0; i < steps.length; i++) {
                if (!steps[i].description || steps[i].description.length > 1000) {
                    return res.status(400).json({ message: `Описание шага ${i + 1} должно быть от 1 до 1000 символов` });
                }
            }

            // Обновляем основные поля
            recipe.title = title;
            recipe.categories = categories;
            recipe.description = description || '';
            recipe.servings = servings;
            recipe.cookingTime = cookingTime;
            recipe.ingredients = ingredients;
            recipe.ingredientQuantities = ingredientQuantities;
            recipe.ingredientUnits = ingredientUnits;

            // Обновляем изображение рецепта
            if (req.files && req.files.recipeImage && req.files.recipeImage[0]) {
                if (recipe.image) {
                    const publicId = recipe.image.split('/').pop().split('.')[0];
                    await cloudinary.uploader.destroy(`recipes/${publicId}`);
                }
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { resource_type: 'image', folder: 'recipes' },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(req.files.recipeImage[0].buffer);
                });
                recipe.image = result.secure_url;
                console.log('Recipe image updated:', recipe.image);
            } else if (removeRecipeImage) {
                if (recipe.image) {
                    const publicId = recipe.image.split('/').pop().split('.')[0];
                    await cloudinary.uploader.destroy(`recipes/${publicId}`);
                }
                recipe.image = '';
                console.log('Recipe image removed');
            }

            // Обновляем шаги и их изображения
            const stepImageUrls = Array(steps.length).fill('');
            if (req.files && req.files.stepImages) {
                for (const file of req.files.stepImages) {
                    const match = file.fieldname.match(/stepImages\[(\d+)\]/);
                    if (match) {
                        const index = parseInt(match[1]);
                        if (index < steps.length) {
                            if (recipe.steps[index] && recipe.steps[index].image) {
                                const publicId = recipe.steps[index].image.split('/').pop().split('.')[0];
                                await cloudinary.uploader.destroy(`recipe_steps/${publicId}`);
                            }
                            const result = await new Promise((resolve, reject) => {
                                cloudinary.uploader.upload_stream(
                                    { resource_type: 'image', folder: 'recipe_steps' },
                                    (error, result) => {
                                        if (error) reject(error);
                                        else resolve(result);
                                    }
                                ).end(file.buffer);
                            });
                            stepImageUrls[index] = result.secure_url;
                            console.log(`Step ${index + 1} image uploaded: ${stepImageUrls[index]}`);
                        }
                    }
                }
            }

            // Обновляем шаги, сохраняя существующие изображения, если новые не загружены
            recipe.steps = steps.map((step, index) => ({
                description: step.description || '',
                image: step.image || stepImageUrls[index] || (recipe.steps[index] && recipe.steps[index].image) || ''
            }));

            // Сбрасываем статус на pending, если редактирует не админ
            if (!req.user.isAdmin) {
                recipe.status = 'pending';
                console.log(`Recipe ${req.params.id} status reset to pending due to user edit`);
            }

            await recipe.save();
            console.log(`Recipe ${req.params.id} updated`);
            res.json(recipe);
        } catch (err) {
            console.error(`PUT /api/recipes/${req.params.id} - Error:`, err.message, err.stack);
            res.status(500).json({ message: err.message });
        }
    }
);

module.exports = router;