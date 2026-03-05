// server/routes/auth.js
// NOOR AI — Auth Routes (register, login, refresh)

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { generateTokens, verifyRefreshToken } = require('../middleware/auth');
const { initUser, getBalance } = require('../services/credits');

// Simple password hashing (use bcrypt in prod — add to package.json if needed)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'noor-salt-2024').digest('hex');
}

// In-memory user store — swap for Supabase in production
const users = new Map();

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const emailNorm = email.toLowerCase().trim();

    if (users.has(emailNorm)) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const userId = crypto.randomUUID();
    users.set(emailNorm, {
        userId,
        email: emailNorm,
        name: name || emailNorm.split('@')[0],
        password: hashPassword(password),
        plan: 'free',
        createdAt: new Date().toISOString(),
    });

    // Give new users 100 free credits
    initUser(userId, 100, 'free');

    const tokens = generateTokens(userId, emailNorm, 'free');

    return res.status(201).json({
        success: true,
        message: 'Account created. 100 free credits added.',
        userId,
        ...tokens,
    });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });

    const emailNorm = email.toLowerCase().trim();
    const user = users.get(emailNorm);

    if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const tokens = generateTokens(user.userId, emailNorm, user.plan);
    const balance = getBalance(user.userId);

    return res.json({
        success: true,
        userId: user.userId,
        email: user.email,
        name: user.name,
        plan: user.plan,
        credits: balance?.credits || 0,
        ...tokens,
    });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

    try {
        const userId = verifyRefreshToken(refreshToken);

        // Find user by ID
        let found = null;
        for (const u of users.values()) {
            if (u.userId === userId) { found = u; break; }
        }

        if (!found) return res.status(401).json({ error: 'User not found.' });

        const tokens = generateTokens(found.userId, found.email, found.plan);
        return res.json({ success: true, ...tokens });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
    const balance = getBalance(req.userId);
    return res.json({
        userId: req.userId,
        email: req.user?.email || null,
        plan: req.user?.plan || 'free',
        credits: balance?.credits || 0,
    });
});

module.exports = router;
