const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_marketplace_key_2026';

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit to handle image payloads/base64 if sent from frontend
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// In-memory data stores (can be easily swapped for MongoDB or PostgreSQL later)
const users = {};
const otpStore = {};
const products = [];

// 1. Register & Send OTP Endpoint
app.post('/api/register', (req, res) => {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).json({ error: 'All fields (name, email, phone) are required.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    otpStore[email] = {
        otp,
        name,
        phone,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
    };

    users[email] = { name, email, phone, verified: false };

    console.log(`[SECURE OTP] Generated code for ${email}: ${otp}`);

    res.status(200).json({ 
        message: 'Secure verification code dispatched successfully.',
        debug_otp: otp // Included for testing convenience
    });
});

// 2. Verify OTP & Issue JWT Token Endpoint
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

    if (users[email]) {
        users[email].verified = true;
    }

    delete otpStore[email]; // Clear OTP after single-use

    // Issue cryptographic JWT token valid for 7 days
    const token = jwt.sign(
        { email, name: record.name, phone: record.phone },
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

// Middleware to Protect Routes with JWT
function verifyJwtToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // Expecting "Bearer <token>"
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Malformed token format.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token session.' });
        }
        req.user = decoded;
        next();
    });
}

// 3. Publish Product Listing Endpoint (Protected by JWT, accepts location and images)
app.post('/api/products', verifyJwtToken, (req, res) => {
    const { title, category, price, description, location, images } = req.body;

    if (!title || !price || !location) {
        return res.status(400).json({ error: 'Product title, price, and location coordinates are required.' });
    }

    const newProduct = {
        id: Date.now(),
        title,
        category: category || 'General',
        price,
        description: description || '',
        location, // Contains { lat, lng } coordinates
        images: images || [], // Array of image URLs or base64 strings
        seller: req.user.name,
        sellerEmail: req.user.email,
        createdAt: new Date()
    };

    products.push(newProduct);
    console.log(`[MARKETPLACE] New item published by ${req.user.name}: "${title}"`);

    res.status(201).json({
        success: true,
        message: 'Product listing published successfully!',
        product: newProduct
    });
});

// 4. Public Endpoint to Fetch All Marketplace Products
app.get('/api/products', (req, res) => {
    res.status(200).json({
        success: true,
        count: products.length,
        products
    });
});

app.listen(PORT, () => {
    console.log(`Marketplace backend server running securely on port ${PORT}`);
});