// server/middleware/auth.js
// JWT Authentication Middleware

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'noor-ai-dev-secret-change-in-production';

/**
 * Strict auth — rejects requests without a valid token
 */
function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    // Also accept x-user-id header in development for backwards compat
    if (!token && process.env.NODE_ENV !== 'production') {
        const devUserId = req.headers['x-user-id'];
        if (devUserId) {
            req.userId = devUserId;
            req.user = { userId: devUserId, email: null, plan: 'pro' };
            return next();
        }
    }

    if (!token) {
        return res.status(401).json({ error: 'unauthorized', message: 'Missing authentication token.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'token_expired', message: 'Token has expired. Please refresh.' });
        }
        return res.status(401).json({ error: 'invalid_token', message: 'Invalid authentication token.' });
    }
}

/**
 * Optional auth — attaches user if token present, continues regardless
 */
function optionalAuth(req, _res, next) {
    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        req.userId = req.headers['x-user-id'] || 'anonymous';
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.user = decoded;
    } catch {
        req.userId = 'anonymous';
    }
    next();
}

/**
 * Generate a JWT access token (15 min) and refresh token (30 days)
 */
function generateTokens(userId, email, plan = 'free') {
    const payload = { userId, email, plan };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });

    return { accessToken, refreshToken, expiresIn: 900 };
}

/**
 * Verify a refresh token and return the userId
 */
function verifyRefreshToken(token) {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
    return decoded.userId;
}

module.exports = { requireAuth, optionalAuth, generateTokens, verifyRefreshToken, JWT_SECRET };
