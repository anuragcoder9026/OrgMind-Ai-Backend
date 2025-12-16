const express = require('express');
const router = express.Router();
const { registerOrg, loginOrg, googleAuth, getMe } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/signup', registerOrg);
router.post('/login', loginOrg);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);

module.exports = router;
