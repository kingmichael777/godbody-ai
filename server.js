// server.js
// Godbody AI — Main Server Entry Point

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initUser, initAdmin } = require('./server/services/credits');

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    'https://www.godbody.io',
    'https://godbody.io',
    'https://godbody-ai-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        // allow server-to-server (no origin) or whitelisted
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-admin-key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
    console.log(`[GODBODY] ${req.method} ${req.path}`);
    next();
});

// Init admin account on every boot
initAdmin();

// Auto-init demo user for every request
app.use((req, _res, next) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    initUser(userId, 2400, 'pro');
    next();
});

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
// Stripe webhook must come before express.json() for raw body access
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Admin login — returns the admin userId to use as x-user-id header
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password.' });
    }
    const adminId = (process.env.ADMIN_USER_IDS || 'admin').split(',')[0].trim();
    res.json({ success: true, userId: adminId, plan: 'owner', message: 'Welcome back, owner.' });
});

app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/generate', require('./server/routes/generate'));
app.use('/api/jobs', require('./server/routes/jobs'));
app.use('/api/upload', require('./server/routes/upload'));
app.use('/api/stripe', require('./server/routes/stripe'));

// Serve uploads locally (dev only — use S3 in production)
const path = require('path');
const { LOCAL_UPLOAD_DIR } = require('./server/services/storage');
app.use('/uploads', require('express').static(LOCAL_UPLOAD_DIR));
app.use('/client', require('express').static(path.join(__dirname, 'client')));

// Root redirect → main app UI
app.get('/', (_req, res) => res.redirect('/client/index.html'));
app.get('/app', (_req, res) => res.redirect('/client/index.html'));


// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'online',
        service: 'Godbody AI Backend',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        heygenConfigured: !!process.env.HEYGEN_API_KEY,
    });
});

// ─────────────────────────────────────────────
// HeyGen REMAINING CREDITS CHECK
// ─────────────────────────────────────────────
app.get('/api/heygen/quota', async (_req, res) => {
    try {
        const heygen = require('./server/services/heygen');
        const remaining = await heygen.getRemainingCredits();
        res.json({ heygenCreditsRemaining: remaining });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// 404 HANDLER
// ─────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found.' });
});

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('[GODBODY] Unhandled error:', err);
    res.status(500).json({
        error: 'internal_server_error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.',
    });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🌟 Godbody AI Backend running on port ${PORT}`);
    console.log(`   Health:    http://localhost:${PORT}/api/health`);
    console.log(`   HeyGen:   ${process.env.HEYGEN_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`   Replicate: ${process.env.REPLICATE_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`   ElevenLabs:${process.env.ELEVENLABS_API_KEY ? '✓ Configured' : '✗ Missing'}\n`);
});

module.exports = app;
