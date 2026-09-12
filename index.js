const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your_super_secure_jwt_secret_key_here'; // In production, use process.env.JWT_SECRET

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory data store (replace with PostgreSQL or your DB in production)
const users = {};
const otpStore = {};

// Middleware to verify JWT on protected routes
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Malformed token.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user data (email, name) to request
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

// 1. Register & Send OTP Endpoint
app.post('/api/register', (req, res) => {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({ error: 'All fields (name, email, phone) are required.' });
    }

    // Generate a mock 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    otpStore[email] = {
        otp,
        name,
        phone,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiration
    };

    users[email] = { name, email, phone, verified: false };

    console.log(`[SECURE OTP] Generated code for ${email}: ${otp}`);

    res.status(200).json({ 
        message: 'Secure verification code dispatched successfully.',
        debug_otp: otp 
    });
});

// 2. Verify OTP Endpoint & Issue JWT
app.post('/api/verify', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const record = otpStore[email];

    if (!record) {
        return res.status(400).json({ error: 'No verification request found for this email.' });
    }

    if (Date.now() > record.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Mark user as verified
    if (users[email]) {
        users[email].verified = true;
    }

    delete otpStore[email]; // Clear OTP after successful use

    // Generate JSON Web Token (JWT) valid for 7 days
    const token = jwt.sign(
        { email: email, name: record.name }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
    );

    res.status(200).json({ 
        success: true, 
        message: 'Account successfully authenticated and verified.',
        token,
        name: record.name
    });
});

// 3. Protected Product Listing Endpoint (Requires JWT Authentication)
app.post('/api/products', verifyToken, (req, res) => {
    const { title, category, price, description, location } = req.body;

    if (!title || !price || !location) {
        return res.status(400).json({ error: 'Product title, price, and location data are required.' });
    }

    const newProduct = {
        id: Date.now(),
        title,
        category,
        price,
        description,
        location,
        seller: req.user.name, // Securely pulled from the verified JWT payload
        sellerEmail: req.user.email,
        createdAt: new Date()
    };

    console.log('[MARKETPLACE JWT PROTECTED] New product published by:', req.user.email);

    res.status(201).json({
        success: true,
        message: 'Product listing published securely!',
        product: newProduct
    });
});

app.listen(PORT, () => {
    console.log(`Secure JWT marketplace server running on port ${PORT}`);
});