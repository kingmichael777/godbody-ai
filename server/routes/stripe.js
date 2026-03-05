// server/routes/stripe.js
// NOOR AI — Stripe Payment Routes

const express = require('express');
const router = express.Router();

const {
    CREDIT_PACKAGES,
    createCheckoutSession,
    processWebhookEvent,
    verifyWebhookSignature,
    getCheckoutSession,
    createPortalSession,
} = require('../services/stripe');

const { initUser, addCredits, getBalance, applyPlanCredits } = require('../services/credits');

// GET /api/stripe/packages
router.get('/packages', (_req, res) => {
    return res.json({ packages: Object.values(CREDIT_PACKAGES) });
});

// POST /api/stripe/checkout
router.post('/checkout', async (req, res) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    const { packageId, userEmail } = req.body;

    if (!packageId) return res.status(400).json({ error: 'packageId is required.' });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/client/credits.html`;
    const cancelUrl = `${baseUrl}/client/credits.html`;

    try {
        const result = await createCheckoutSession({ userId, packageId, successUrl, cancelUrl, userEmail });
        return res.json({ success: true, checkoutUrl: result.checkoutUrl, sessionId: result.sessionId, package: result.package });
    } catch (err) {
        console.error('[NOOR] Stripe checkout error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/stripe/webhook
router.post('/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const signature = req.headers['stripe-signature'];
        if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header.' });

        let event;
        try {
            event = verifyWebhookSignature(req.body, signature);
        } catch (err) {
            console.error('[NOOR] Webhook signature failed:', err.message);
            return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
        }

        console.log(`[NOOR] Stripe webhook: ${event.type}`);

        try {
            const result = await processWebhookEvent(event);

            switch (result.action) {
                case 'add_credits':
                    initUser(result.userId, 0);
                    const credited = addCredits(result.userId, result.credits, result.source);
                    console.log(`[NOOR] Credited ${result.credits} to user ${result.userId}. Balance: ${credited.newBalance}`);
                    break;

                case 'renewal_credits':
                    initUser(result.userId, 0);
                    applyPlanCredits(result.userId, result.packageId);
                    console.log(`[NOOR] Renewed ${result.credits} credits for user ${result.userId}`);
                    break;

                case 'subscription_cancelled':
                    console.log(`[NOOR] Subscription cancelled for user ${result.userId}`);
                    break;

                case 'payment_failed':
                    console.log(`[NOOR] Payment failed for user ${result.userId}`);
                    break;

                default:
                    break;
            }

            return res.json({ received: true, action: result.action });
        } catch (err) {
            console.error('[NOOR] Webhook processing error:', err);
            return res.json({ received: true, error: err.message });
        }
    }
);

// GET /api/stripe/success
router.get('/success', async (req, res) => {
    const { session_id } = req.query;
    const userId = req.headers['x-user-id'] || 'demo-user';

    if (!session_id) return res.status(400).json({ error: 'session_id required.' });

    try {
        const session = await getCheckoutSession(session_id);
        if (session.paymentStatus !== 'paid') return res.status(402).json({ error: 'Payment not completed.' });

        const balance = getBalance(userId);
        return res.json({ success: true, message: `${session.credits} credits added.`, credits: session.credits, amountPaid: session.amountPaid, balance: balance?.credits || 0 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/stripe/portal
router.post('/portal', async (req, res) => {
    const { stripeCustomerId } = req.body;
    if (!stripeCustomerId) return res.status(400).json({ error: 'stripeCustomerId required.' });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/client/credits.html`;

    try {
        const result = await createPortalSession({ stripeCustomerId, returnUrl });
        return res.json({ portalUrl: result.portalUrl });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
