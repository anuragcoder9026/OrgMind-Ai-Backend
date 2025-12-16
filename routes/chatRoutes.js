const express = require('express');
const router = express.Router();
const { chat, getChatLogs, saveFeedback } = require('../controllers/chatController');
const { chatAuth } = require('../middlewares/chatAuth');

router.post('/', chatAuth, chat);
router.post('/public', chatAuth, chat); // Widget endpoint
router.get('/logs', chatAuth, getChatLogs);
router.post('/feedback', chatAuth, saveFeedback);

module.exports = router;
