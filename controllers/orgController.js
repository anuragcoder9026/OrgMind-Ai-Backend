const Organisation = require('../models/Organisation');

const updateSettings = async (req, res) => {
    try {
        const org = await Organisation.findById(req.user._id);

        if (org) {
            org.settings = { ...org.settings, ...req.body };
            await org.save();
            res.json(org.settings);
        } else {
            res.status(404).json({ message: 'Organisation not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const regenerateApiKey = async (req, res) => {
    try {
        const org = await Organisation.findById(req.user._id);
        const crypto = require('crypto');

        if (org) {
            org.apiKey = 'sk_org_' + crypto.randomBytes(24).toString('hex');
            await org.save();
            res.json({ apiKey: org.apiKey });
        } else {
            res.status(404).json({ message: 'Organisation not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
}

const updateGeminiApiKey = async (req, res) => {
    try {
        const { geminiApiKey } = req.body;
        const org = await Organisation.findById(req.user._id);

        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }

        if (!geminiApiKey || geminiApiKey.trim() === '') {
            return res.status(400).json({ message: 'Gemini API key is required' });
        }

        org.geminiApiKey = geminiApiKey;
        await org.save();

        res.json({ message: 'Gemini API key updated successfully' });
    } catch (error) {
        console.error('Error updating Gemini API key:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const testGeminiApiKey = async (req, res) => {
    try {
        const { apiKey } = req.body;

        console.log('Testing Gemini API key...');

        if (!apiKey || apiKey.trim() === '') {
            console.log('API key is empty or missing');
            return res.status(400).json({ message: 'API key is required', valid: false });
        }

        // Test the API key by making a simple request
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

        console.log('Making test request to Gemini...');

        // Simple test prompt
        const result = await model.generateContent('Say hello');
        const response = await result.response;
        const text = response.text();

        console.log('Gemini API test successful:', text);

        if (text) {
            return res.json({ message: 'API key is valid', valid: true });
        } else {
            console.log('No text response from Gemini');
            return res.status(400).json({ message: 'Invalid API key response', valid: false });
        }
    } catch (error) {
        // console.error('Error testing Gemini API key:', error.message);
        console.error('Full error:', error.statusText);
        return res.status(400).json({
            message: error.statusText || 'Invalid API key',
            valid: false
        });
    }
};

const deleteGeminiApiKey = async (req, res) => {
    try {
        const org = await Organisation.findById(req.user._id);

        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }

        org.geminiApiKey = null;
        await org.save();

        res.json({ message: 'Gemini API key removed successfully' });
    } catch (error) {
        console.error('Error deleting Gemini API key:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { updateSettings, regenerateApiKey, updateGeminiApiKey, testGeminiApiKey, deleteGeminiApiKey };
