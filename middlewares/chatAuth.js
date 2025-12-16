const Organisation = require('../models/Organisation');
const jwt = require('jsonwebtoken');

const chatAuth = async (req, res, next) => {
    let org;

    // Check for API Key (SDK)
    if (req.headers['x-api-key']) {
        const apiKey = req.headers['x-api-key'];
        org = await Organisation.findOne({ apiKey });
    }
    // Check for JWT (Dashboard)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            org = await Organisation.findById(decoded.id);
        } catch (error) {
            // Invalid token
        }
    }

    if (!org) {
        return res.status(401).json({ message: 'Not authorized' });
    }

    req.org = org;
    next();
};

module.exports = { chatAuth };
