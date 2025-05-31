const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../cloudinary');

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
                console.log('Uploading recipe image to Cloudinary');
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
                recipeImageUrl = result.secure_url;
                console.log('Recipe image uploaded:', recipeImageUrl);
            }

            const stepImageUrls = [];
            if (req.files && req.files.stepImages) {
                console.log('Uploading step images to Cloudinary:', req.files.stepImages.length);
                for (const file of req.files.stepImages) {
                    const result = await new Promise((resolve, reject) => {
                        cloudinary.uploader
                            .upload_stream(
                                { resource_type: 'image', folder: 'recipe_steps' },
                                (error, result) => {
                                    if (error) reject(error);
                                    else resolve(result);
                                },
                            )
                            .end(file.buffer);
                    });
                    stepImageUrls.push(result.secure_url);
                }
                console.log('Step images uploaded:', stepImageUrls);
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
                    image: stepImageUrls[index] || '',
                })),
                author: req.user.id,
            });

            await recipe.save();
            res.status(201).json(recipe);
        } catch (err) {
            console.error('POST /api/recipes - Error:', err.message, err.stack);
            res.status(400).json({ message: err.message });
        }
    },
);

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
        console.log(`Recipe ${req.params.id} deleted`);
        res.json({ message: 'Рецепт удалён' });
    } catch (err) {
        console.error(`DELETE /api/recipes/${req.params.id} - Error:`, err.message, err.stack);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;