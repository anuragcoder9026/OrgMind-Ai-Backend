const Organisation = require('../models/Organisation');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const generateApiKey = () => {
    return 'sk_org_' + crypto.randomBytes(24).toString('hex');
};

const registerOrg = async (req, res) => {
    const { name, email, password } = req.body;

    const orgExists = await Organisation.findOne({ email });

    if (orgExists) {
        res.status(400).json({ message: 'Organisation already exists' });
        return;
    }

    const orgId = 'org_' + crypto.randomBytes(8).toString('hex');
    const apiKey = generateApiKey();

    const org = await Organisation.create({
        name,
        email,
        password,
        orgId,
        apiKey
    });

    if (org) {
        res.status(201).json({
            _id: org._id,
            name: org.name,
            email: org.email,
            orgId: org.orgId,
            apiKey: org.apiKey,
            token: generateToken(org._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid organisation data' });
    }
};

const loginOrg = async (req, res) => {
    const { email, password } = req.body;

    const org = await Organisation.findOne({ email });

    if (org && (await org.matchPassword(password))) {
        res.json({
            _id: org._id,
            name: org.name,
            email: org.email,
            orgId: org.orgId,
            apiKey: org.apiKey,
            token: generateToken(org._id),
        });
    } else {
        res.status(401).json({ message: 'Invalid email or password' });
    }
};

const googleAuth = async (req, res) => {
    const { token } = req.body;

    try {
        // Fetch user info using the access token
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const { name, email, sub } = response.data;

        let org = await Organisation.findOne({ email });

        if (org) {
            res.json({
                _id: org._id,
                name: org.name,
                email: org.email,
                orgId: org.orgId,
                apiKey: org.apiKey,
                token: generateToken(org._id),
            });
        } else {
            const password = crypto.randomBytes(16).toString('hex'); // Random password
            const orgId = 'org_' + crypto.randomBytes(8).toString('hex');
            const apiKey = generateApiKey();

            org = await Organisation.create({
                name,
                email,
                password,
                orgId,
                apiKey
            });

            res.status(201).json({
                _id: org._id,
                name: org.name,
                email: org.email,
                orgId: org.orgId,
                apiKey: org.apiKey,
                token: generateToken(org._id),
            });
        }
    } catch (error) {
        console.error('Google Auth Error:', error.response?.data || error.message);
        res.status(400).json({ message: 'Google authentication failed' });
    }
};

const getMe = async (req, res) => {
    const org = await Organisation.findById(req.user._id);

    if (org) {
        res.json({
            _id: org._id,
            name: org.name,
            email: org.email,
            orgId: org.orgId,
            apiKey: org.apiKey,
            geminiApiKey: org.geminiApiKey,
            settings: org.settings
        });
    } else {
        res.status(404).json({ message: 'Organisation not found' });
    }
};

module.exports = { registerOrg, loginOrg, googleAuth, getMe };
