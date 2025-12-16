const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const organisationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    orgId: {
        type: String,
        unique: true,
        required: true
    },
    apiKey: {
        type: String,
        unique: true
    },
    geminiApiKey: {
        type: String,
        default: null
    },
    settings: {
        chatbotTone: { type: String, default: 'professional' },
        systemInstructions: { type: String, default: '' },
        allowedTopics: { type: [String], default: [] },
        displayName: { type: String, default: 'AI Assistant' },
        theme: { type: String, default: 'light' }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

organisationSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

organisationSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Organisation', organisationSchema);
