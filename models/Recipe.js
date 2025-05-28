const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    servings: { type: Number, required: true },
    cookingTime: { type: Number, required: true },
    ingredients: [{ type: String, required: true }],
    ingredientQuantities: [{ type: Number, required: true }],
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