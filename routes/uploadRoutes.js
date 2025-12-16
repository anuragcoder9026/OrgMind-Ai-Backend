const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadFile, uploadUrl, getDocuments, deleteDocument } = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware');

const upload = multer({ dest: 'uploads/' });

router.post('/file', protect, upload.single('file'), uploadFile);
router.post('/url', protect, uploadUrl);
router.get('/', protect, getDocuments);
router.delete('/:id', protect, deleteDocument);

module.exports = router;
