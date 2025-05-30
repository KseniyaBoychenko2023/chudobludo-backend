const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    categories: [{ 
        type: String, 
        required: true,
        enum: [
            'Завтрак', 'Обед', 'Ужин',
            'Китайская кухня', 'Итальянская кухня', 'Русская кухня',
            'Горячее блюдо', 'Закуски', 'Десерт', 'Напитки'
        ]
    }],
    description: { type: String, required: true },
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
    ingredients: [{ type: String, required: true }],
    ingredientQuantities: [{ 
        type: Number, 
        required: true,
        min: [0, 'Количество не может быть отрицательным'],
        max: [1000, 'Количество не может превышать 1000']
    }],
    ingredientCount: { type: Number },  
    image: { type: String },
    steps: [{
        description: { type: String, required: true },
        image: { type: String }
    }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Recipe', recipeSchema);