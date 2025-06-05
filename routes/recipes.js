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
        { name: 'step-image', maxCount: 50 },
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

            const { title, categories, description, servings, cookingTime, ingredients, ingredientQuantities, ingredientUnits, steps } = recipeData;

            console.log('>> Multer присвоил req.files:', req.files);
            console.log('>> Multer присвоил req.body:', req.body);


            // Валидация
            if (!title || title.length > 50) {
                return res.status(400).json({ message: 'Название рецепта должно быть от 1 до 50 символов' });
            }
            if (!description || description.length > 1000) {
                return res.status(400).json({ message: 'Описание рецепта должно быть от 1 до 1000 символов' });
            }
            if (!Array.isArray(categories) || categories.length === 0) {
                return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
            }
            if (typeof servings !== 'number' || servings < 1 || servings > 100) {
                return res.status(400).json({ message: 'Количество порций должно быть от 1 до 100' });
            }
            if (typeof cookingTime !== 'number' || cookingTime < 1 || cookingTime > 100000) {
                return res.status(400).json({ message: 'Время приготовления должно быть от 1 до 100000 минут' });
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
            if (!Array.isArray(steps) || steps.length === 0 || steps.length > 50) {
                return res.status(400).json({ message: 'Должен быть хотя бы один шаг, но не более 50' });
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
                if (ingredientUnits[i] === 'пв' && ingredientQuantities[i] !== 0) {
                    return res.status(400).json({ message: `Для единицы "по вкусу" количество должно быть 0 для ингредиента ${i + 1}` });
                }
            }

            for (let i = 0; i < steps.length; i++) {
                if (!steps[i].description || steps[i].description.length > 1000) {
                    return res.status(400).json({ message: `Описание шага ${i + 1} должно быть от 1 до 1000 символов` });
                }
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
            if (req.files && req.files['step-image']) {
                await Promise.all(
                    req.files['step-image'].map((file, idx) => 
                        new Promise((resolve, reject) => {
                            cloudinary.uploader.upload_stream(
                                { resource_type: 'image', folder: 'recipe_steps' },
                                (error, result) => {
                                    if (error) return reject(error);
                                    stepImageUrls[idx] = result.secure_url;
                                    resolve();
                                }
                            ).end(file.buffer);
                        })
                    )
                );
            }

            const recipe = new Recipe({
                title,
                categories,
                description,
                servings,
                cookingTime,
                ingredients,
                ingredientQuantities,
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

            console.log('>> Проверяем объект для сохранения:', JSON.stringify(recipe, null, 2));

            try {
                await recipe.save();
            } catch(validationErr) {
                console.error('Ошибка валидации Mongoose при сохранении рецепта:', validationErr);
                return res.status(400).json({ message: 'Ошибка валидации при сохранении', details: validationErr.message });
            }


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

// Публичный роут: возвращает все recipes с status = 'published', авторизация не требуется
router.get('/public', async (req, res) => {
  try {
    const recipes = await Recipe.find({ status: 'published' });
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Новый маршрут для получения рецепта по ID
router.get('/:id', auth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log(`Invalid recipeId: ${req.params.id}`);
            return res.status(400).json({ message: 'Неверный ID рецепта' });
        }
        const recipe = await Recipe.findById(req.params.id);
        if (!recipe) {
            console.log(`Recipe ${req.params.id} not found`);
            return res.status(404).json({ message: 'Рецепт не найден' });
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

router.put('/:id/reconsider', auth, async (req, res) => {
  try {
    // 1) Проверяем, что пользователь авторизован и является админом:
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Только администратор может "повторно отправить на рассмотрение"' });
    }
    // 2) Проверяем валидность ID и находим рецепт:
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Неверный ID рецепта' });
    }
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Рецепт не найден' });
    }
    // 3) Если сейчас статус != 'rejected', нельзя «возвращать на рассмотрение»:
    if (recipe.status !== 'rejected') {
      return res.status(400).json({ message: 'Нельзя повторно отправить на рассмотрение рецепт со статусом "' + recipe.status + '"' });
    }
    // 4) Меняем статус:
    recipe.status = 'pending';
    await recipe.save();
    return res.json({ message: 'Рецепт возвращён на рассмотрение', recipe });
  } catch (err) {
    console.error(`PUT /api/recipes/${req.params.id}/reconsider — Error:`, err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера', error: err.message });
  }
});


router.put(
  '/:id',
  auth,
  upload.fields([
    { name: 'recipeImage', maxCount: 1 },
    { name: 'step-image', maxCount: 50 },
  ]),
  async (req, res) => {
    try {
      console.log(`PUT /api/recipes/${req.params.id} - User ID:`, req.user?.id);

      // 1) Проверка авторизации + существования рецепта
      if (!req.user?.id) {
        return res.status(401).json({ message: 'Пользователь не авторизован' });
      }
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Неверный ID рецепта' });
      }
      const recipe = await Recipe.findById(req.params.id);
      if (!recipe) {
        return res.status(404).json({ message: 'Рецепт не найден' });
      }
      if (recipe.author.toString() !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Вы не можете редактировать этот рецепт' });
      }

      // 2) Парсим данные из req.body.recipeData
      let recipeData = req.body.recipeData;
      if (!recipeData) {
        return res.status(400).json({ message: 'Данные рецепта отсутствуют' });
      }
      if (typeof recipeData === 'string') {
        try {
          recipeData = JSON.parse(recipeData);
        } catch (err) {
          return res.status(400).json({ message: 'Неверный формат JSON в recipeData' });
        }
      }

      const {
        title,
        categories,
        description,
        servings,
        cookingTime,
        ingredients,
        ingredientQuantities,
        ingredientUnits,
        steps,
        removeRecipeImage
      } = recipeData;

      // 3) Валидация полей (всё как у вас было, но без дублирования)
      if (!title || title.length > 50) {
        return res.status(400).json({ message: 'Название рецепта должно быть от 1 до 50 символов' });
      }
      if (!description || description.length > 1000) {
        return res.status(400).json({ message: 'Описание рецепта должно быть до 1000 символов' });
      }
      if (!Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
      }
      if (typeof servings !== 'number' || servings < 1 || servings > 100) {
        return res.status(400).json({ message: 'Количество порций должно быть от 1 до 100' });
      }
      if (typeof cookingTime !== 'number' || cookingTime < 1 || cookingTime > 100000) {
        return res.status(400).json({ message: 'Время приготовления должно быть от 1 до 100000 минут' });
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
      for (let i = 0; i < ingredients.length; i++) {
        if (!ingredients[i] || ingredients[i].length > 50) {
          return res.status(400).json({
            message: `Ингредиент ${i + 1} должен быть от 1 до 50 символов`
          });
        }
        const qty = ingredientQuantities[i];
        if (typeof qty !== 'number' || qty < 0 || qty > 1000) {
          return res.status(400).json({
            message: `Количество для ингредиента ${i + 1} должно быть от 0 до 1000`
          });
        }
        const unit = ingredientUnits[i];
        if (!['г', 'кг', 'мл', 'л', 'шт', 'ст', 'стл', 'чл', 'пв'].includes(unit)) {
          return res.status(400).json({
            message: `Недопустимая единица измерения для ингредиента ${i + 1}`
          });
        }
        if (unit === 'пв' && qty !== 0) {
          return res.status(400).json({
            message: `Для единицы "по вкусу" количество должно быть 0 для ингредиента ${i + 1}`
          });
        }
      }
      if (!Array.isArray(steps) || steps.length === 0 || steps.length > 50) {
        return res.status(400).json({ message: 'Должен быть хотя бы один шаг, но не более 50' });
      }
      for (let i = 0; i < steps.length; i++) {
        if (!steps[i].description || steps[i].description.length > 1000) {
          return res.status(400).json({
            message: `Описание шага ${i + 1} должно быть от 1 до 1000 символов`
          });
        }
      }

      // 4) Обновляем основные поля в объекте recipe:
      recipe.title = title;
      recipe.categories = categories;
      recipe.description = description;
      recipe.servings = servings;
      recipe.cookingTime = cookingTime;
      recipe.ingredients = ingredients;
      recipe.ingredientQuantities = ingredientQuantities;
      recipe.ingredientUnits = ingredientUnits;

      // 5) Если пришёл флаг removeRecipeImage=true, убираем старую картинку:
      if (removeRecipeImage && recipe.image) {
        // Парсим publicId («имя без расширения») и удаляем из Cloudinary
        const publicId = recipe.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`recipes/${publicId}`);
        recipe.image = '';
      }

      // 6) Если пришёл новый файл recipeImage, загружаем его и удаляем старый:
      if (req.files && req.files.recipeImage && req.files.recipeImage[0]) {
        if (recipe.image) {
          const oldPublicId = recipe.image.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`recipes/${oldPublicId}`);
        }
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: 'recipes' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(req.files.recipeImage[0].buffer);
        });
        recipe.image = uploadResult.secure_url;
      }

      // 7) Подготовка массива для новых URL картинок шагов
      const stepImageUrls = Array(steps.length).fill('');

      // 8) Если пришли файлы шагов, загружаем их в том порядке, в каком их передали в FormData:
      if (req.files && req.files['step-image']) {
        await Promise.all(
            req.files['step-image'].map((file, idx) => 
                new Promise((resolve, reject) => {
                    if (recipe.steps[idx] && recipe.steps[idx].image) {
                        const oldStepId = recipe.steps[idx].image.split('/').pop().split('.')[0];
                        cloudinary.uploader.destroy(`recipe_steps/${oldStepId}`, () => {});
                    }
                    cloudinary.uploader.upload_stream(
                        { resource_type: 'image', folder: 'recipe_steps' },
                        (error, result) => {
                            if (error) return reject(error);
                            stepImageUrls[idx] = result.secure_url;
                            resolve();
                        }
                    ).end(file.buffer);
                })
            )
        );
    }

      // 9) Составляем окончательный массив recipe.steps:
      recipe.steps = steps.map((step, index) => ({
        description: step.description,
        image:
          // приоритет: 1) новая картинка из stepImageUrls[index]
          //            2) старая картинка recipe.steps[index].image (если её не удалили)
          //            3) пустая строка
          stepImageUrls[index] || (recipe.steps[index]?.image || '')
      }));

      // 10) Если текущий пользователь — не админ, сбрасываем статус на «pending»:
      if (!req.user.isAdmin) {
        recipe.status = 'pending';
      }

    try {
        await recipe.save();
    } catch(validationErr) {
        console.error('Ошибка валидации Mongoose при обновлении рецепта:', validationErr);
        return res.status(400).json({ message: 'Ошибка валидации при обновлении', details: validationErr.message });
    }
      console.log(`Recipe ${req.params.id} updated`);
      res.json(recipe);

    } catch (err) {
      console.error(`PUT /api/recipes/${req.params.id} - Error:`, err);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера', error: err.message });
    }
  }
);

module.exports = router;