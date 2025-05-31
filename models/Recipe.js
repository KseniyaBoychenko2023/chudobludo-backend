const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        maxlength: [50, 'Название рецепта не должно превышать 50 символов']
    },
    categories: [{ 
        type: String, 
        required: true,
        enum: [
            'Завтрак', 'Обед', 'Ужин',
            'Китайская кухня', 'Итальянская кухня', 'Русская кухня',
            'Горячее блюдо', 'Закуски', 'Десерт', 'Напитки'
        ]
    }],
    description: { 
        type: String, 
        required: true,
        maxlength: [1000, 'Описание не должно превышать 1000 символов']
    },
    servings: { 
        type: Number, 
        required: true,
        min: [1, 'Порции должны быть не менее 1'],
        max: [100, 'Порции не могут превышать 100']
    },
    cookingTime: { 
        type: Number, 
        required: true,
        min: [1, 'Время приготовления должно быть не менее 1 минуты'],
        max: [100000, 'Время приготовления не может превышать 100000 минут']
    },
    ingredients: [{ 
        type: String, 
        required: true,
        maxlength: [50, 'Название ингредиента не должно превышать 50 символов']
    }],
    ingredientQuantities: [{ 
        type: Number, 
        required: true,
        min: [0, 'Количество не может быть отрицательным'],
        max: [1000, 'Количество не может превышать 1000'],
        validate: {
            validator: function(value) {
                const index = this.ingredientQuantities.indexOf(value);
                const unit = this.ingredientUnits[index];
                if (unit === 'пв') {
                    return value === 0;
                }
                return true;
            },
            message: 'Для единицы измерения "по вкусу" количество должно быть 0'
        }
    }],
    ingredientUnits: [{
        type: String,
        required: true,
        enum: ['г', 'кг', 'мл', 'л', 'шт', 'ст', 'стл', 'чл', 'пв']
    }],
    image: { type: String },
    steps: [{
        description: { 
            type: String, 
            required: true,
            maxlength: [1000, 'Описание шага не должно превышать 1000 символов']
        },
        image: { type: String }
    }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

recipeSchema.pre('validate', function(next) {
    if (this.ingredients.length !== this.ingredientQuantities.length ||
        this.ingredients.length !== this.ingredientUnits.length) {
        next(new Error('Длина массивов ingredients, ingredientQuantities и ingredientUnits должна совпадать'));
    } else {
        next();
    }
});

recipeSchema.index({ author: 1 });

module.exports = mongoose.model('Recipe', recipeSchema);