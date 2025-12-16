const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: true,
        index: true
    },
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String
    },
    s3Key: {
        type: String
    },
    s3Url: {
        type: String
    },
    type: {
        type: String,
        enum: ['file', 'url'],
        required: true
    },
    content: {
        type: String // For URLs or small files if needed, but mostly we rely on chunks
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'indexed', 'failed'],
        default: 'pending'
    },
    chunkCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Document', documentSchema);
