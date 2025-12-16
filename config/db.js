const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rag-saas');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error('Please make sure MONGO_URI is set in .env and MongoDB is running.');
        process.exit(1);
    }
};

module.exports = connectDB;
