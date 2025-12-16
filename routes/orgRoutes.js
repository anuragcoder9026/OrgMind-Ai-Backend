const express = require('express');
const router = express.Router();
const { updateSettings, regenerateApiKey, updateGeminiApiKey, testGeminiApiKey, deleteGeminiApiKey } = require('../controllers/orgController');
const { protect } = require('../middlewares/authMiddleware');

router.put('/settings', protect, updateSettings);
router.post('/regenerate-key', protect, regenerateApiKey);
router.put('/gemini-api-key', protect, updateGeminiApiKey);
router.post('/test-gemini-key', protect, testGeminiApiKey);
router.delete('/gemini-api-key', protect, deleteGeminiApiKey);

module.exports = router;
