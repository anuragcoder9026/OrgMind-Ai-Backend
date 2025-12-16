const mongoose = require('mongoose');

const chatLogSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: true,
        index: true
    },
    userQuestion: {
        type: String,
        required: true
    },
    botResponse: {
        type: String,
        required: true
    },
    retrievedChunks: {
        type: Array
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ChatLog', chatLogSchema);
