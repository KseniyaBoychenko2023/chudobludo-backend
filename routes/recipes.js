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
            if (!req.user?.id) {
                console.log('No user ID in req.user');
                return res.status(401).json({ message: 'Пользователь не авторизован' });
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

            if (!recipeData.title || !recipeData.ingredients || !Array.isArray(recipeData.ingredients)) {
                console.log('Invalid ingredients or missing title:', recipeData);
                return res.status(400).json({ message: 'Название и ингредиенты обязательны, ингредиенты должны быть массивом' });
            }
            if (!recipeData.ingredientQuantities || !Array.isArray(recipeData.ingredientQuantities)) {
                console.log('Invalid ingredientQuantities:', recipeData.ingredientQuantities);
                return res.status(400).json({ message: 'Количество ингредиентов должно быть массивом' });
            }
            if (!recipeData.ingredientUnits || !Array.isArray(recipeData.ingredientUnits)) {
                console.log('Invalid ingredientUnits:', recipeData.ingredientUnits);
                return res.status(400).json({ message: 'Единицы измерения должны быть массивом' });
            }
            if (!recipeData.steps || !Array.isArray(recipeData.steps)) {
                console.log('Invalid steps:', recipeData.steps);
                return res.status(400).json({ message: 'Шаги должны быть массивом' });
            }

            if (recipeData.ingredients.length !== recipeData.ingredientQuantities.length ||
                recipeData.ingredients.length !== recipeData.ingredientUnits.length) {
                console.log('Array length mismatch:', {
                    ingredients: recipeData.ingredients.length,
                    quantities: recipeData.ingredientQuantities.length,
                    units: recipeData.ingredientUnits.length
                });
                return res.status(400).json({ message: 'Несоответствие длины массивов ингредиентов, количеств и единиц' });
            }

            let recipeImageUrl = '';
            if (req.files && req.files.recipeImage && req.files.recipeImage[0]) {
                console.log('Uploading recipe image to Cloudinary with config:', cloudinary.config());
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader
                        .upload_stream(
                            { resource_type: 'image', folder: 'recipes' },
                            (error, result) => {
                                if (error) {
                                    console.error('Cloudinary upload error:', error);
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            },
                        )
                        .end(req.files.recipeImage[0].buffer);
                });
                recipeImageUrl = result.secure_url;
                console.log('Recipe image uploaded:', recipeImageUrl);
            }

            const stepImageUrls = [];
            if (req.files) {
                for (let i = 0; i < recipeData.steps.length; i++) {
                    const fieldName = `stepImages[${i}]`;
                    if (req.files[fieldName] && req.files[fieldName][0]) {
                        console.log(`Uploading step image for step ${i} to Cloudinary`);
                        const result = await new Promise((resolve, reject) => {
                            cloudinary.uploader
                                .upload_stream(
                                    { resource_type: 'image', folder: 'recipe_steps' },
                                    (error, result) => {
                                        if (error) {
                                            console.error(`Cloudinary upload error for step ${i}:`, error);
                                            reject(error);
                                        } else {
                                            resolve(result);
                                        }
                                    },
                                )
                                .end(req.files[fieldName][0].buffer);
                        });
                        stepImageUrls[i] = result.secure_url;
                        console.log(`Step image ${i} uploaded:`, stepImageUrls[i]);
                    }
                }
            }

            const recipe = new Recipe({
                title: recipeData.title,
                categories: recipeData.categories || [],
                description: recipeData.description || '',
                servings: parseInt(recipeData.servings) || 1,
                cookingTime: parseInt(recipeData.cookingTime) || 0,
                ingredients: recipeData.ingredients,
                ingredientQuantities: recipeData.ingredientQuantities.map(q => {
                    const parsed = parseFloat(q);
                    console.log('Parsing quantity:', q, 'Result:', parsed);
                    return isNaN(parsed) ? 0 : parsed;
                }),
                ingredientUnits: recipeData.ingredientUnits,
                image: recipeImageUrl,
                steps: recipeData.steps.map((step, index) => ({
                    description: step.description || '',
                    image: stepImageUrls[index] || ''
                })),
                author: req.user.id,
                status: 'pending'
            });

            console.log('Recipe object before save:', recipe.toJSON());
            await recipe.save();

            const user = await User.findById(req.user.id);
            if (!user) {
                console.log('User not found:', req.user.id);
                return res.status(404).json({ message: 'Пользователь не найден' });
            }
            await User.findByIdAndUpdate(
                req.user.id,
                { $push: { createdRecipes: recipe._id } },
                { new: true }
            );
            console.log(`Recipe ${recipe._id} added to user's createdRecipes`);

            res.status(201).json(recipe);
        } catch (err) {
            console.error('POST /api/recipes - Error:', err.message, err.stack);
            res.status(500).json({ message: 'Внутренняя ошибка сервера', error: err.message }); // Изменили на 500 для отладки
        }
    },
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

            // Валидация recipeData
            if (!recipeData.ingredients || !Array.isArray(recipeData.ingredients)) {
                console.log('Invalid ingredients:', recipeData.ingredients);
                return res.status(400).json({ message: 'Ингредиенты должны быть массивом' });
            }
            if (!recipeData.ingredientQuantities || !Array.isArray(recipeData.ingredientQuantities)) {
                console.log('Invalid ingredientQuantities:', recipeData.ingredientQuantities);
                return res.status(400).json({ message: 'Количество ингредиентов должно быть массивом' });
            }
            if (!recipeData.ingredientUnits || !Array.isArray(recipeData.ingredientUnits)) {
                console.log('Invalid ingredientUnits:', recipeData.ingredientUnits);
                return res.status(400).json({ message: 'Единицы измерения должны быть массивом' });
            }
            if (!recipeData.steps || !Array.isArray(recipeData.steps)) {
                console.log('Invalid steps:', recipeData.steps);
                return res.status(400).json({ message: 'Шаги должны быть массивом' });
            }

            const { title, categories, description, servings, cookingTime, ingredients, ingredientQuantities, ingredientUnits, steps } = recipeData;

            // Обновляем основные поля
            recipe.title = title;
            recipe.categories = categories || [];
            recipe.description = description || '';
            recipe.servings = parseInt(servings) || 1;
            recipe.cookingTime = parseInt(cookingTime) || 0;
            recipe.ingredients = ingredients || [];
            recipe.ingredientQuantities = ingredientQuantities.map(q => {
                const parsed = parseFloat(q);
                return isNaN(parsed) ? 0 : parsed;
            }) || [];
            recipe.ingredientUnits = ingredientUnits || [];

            // Проверка соответствия массивов
            if (recipe.ingredients.length !== recipe.ingredientQuantities.length ||
                recipe.ingredients.length !== recipe.ingredientUnits.length) {
                return res.status(400).json({ message: 'Несоответствие длины массивов ингредиентов, количеств и единиц' });
            }

            // Обновляем изображение рецепта
            if (req.files && req.files.recipeImage && req.files.recipeImage[0]) {
                if (recipe.image) {
                    const publicId = recipe.image.split('/').pop().split('.')[0];
                    await cloudinary.uploader.destroy(`recipes/${publicId}`);
                }
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader
                        .upload_stream(
                            { resource_type: 'image', folder: 'recipes' },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            },
                        )
                        .end(req.files.recipeImage[0].buffer);
                });
                recipe.image = result.secure_url;
                console.log('Recipe image updated:', recipe.image);
            }

            // Обновляем шаги и их изображения
            const stepImages = req.files && req.files.stepImages ? req.files.stepImages : [];
            const stepImagePromises = [];
            let stepImageIndex = 0;

            recipe.steps = steps.map((step, index) => {
                const existingStep = recipe.steps[index] || {};
                let stepImage = existingStep.image;

                if (req.files && req.files[`stepImages[${index}]`] && req.files[`stepImages[${index}]`][0]) {
                    const file = req.files[`stepImages[${index}]`][0];
                    const destroyPromise = stepImage
                        ? cloudinary.uploader.destroy(`recipe_steps/${stepImage.split('/').pop().split('.')[0]}`)
                        : Promise.resolve();

                    const uploadPromise = destroyPromise.then(() => {
                        return new Promise((resolve, reject) => {
                            cloudinary.uploader
                                .upload_stream(
                                    { resource_type: 'image', folder: 'recipe_steps' },
                                    (error, result) => {
                                        if (error) reject(error);
                                        else resolve(result.secure_url);
                                    }
                                )
                                .end(file.buffer);
                        });
                    });

                    stepImagePromises.push(uploadPromise.then(url => url).catch(err => {
                        console.error(`Error uploading step image ${index}:`, err);
                        return stepImage || '';
                    }));
                }

                return {
                    description: step.description || '',
                    image: stepImage || ''
                };
            });

            // Ждём завершения всех загрузок
            const uploadedStepImages = await Promise.all(stepImagePromises);
            let uploadedIndex = 0;
            recipe.steps = recipe.steps.map((step, index) => {
                if (req.files && req.files[`stepImages[${index}]`] && req.files[`stepImages[${index}]`][0]) {
                    return {
                        ...step,
                        image: uploadedStepImages[uploadedIndex++] || ''
                    };
                }
                return step;
            });

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