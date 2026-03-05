// server/services/stripe.js
// NOOR AI — Stripe Integration

const Stripe = require('stripe');

let stripeClient = null;

function getStripe() {
    if (stripeClient) return stripeClient;
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured.');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    return stripeClient;
}

const CREDIT_PACKAGES = {
    starter: {
        id: 'starter', name: 'Starter Pack', credits: 500, priceUsd: 9.99, priceCents: 999,
        stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_starter_placeholder',
        description: 'Perfect for trying out NOOR AI tools.', popular: false,
        perCredit: '$0.020', isSubscription: false,
    },
    creator: {
        id: 'creator', name: 'Creator Pack', credits: 1500, priceUsd: 24.99, priceCents: 2499,
        stripePriceId: process.env.STRIPE_PRICE_CREATOR || 'price_creator_placeholder',
        description: 'For consistent content creators.', popular: true,
        perCredit: '$0.017', isSubscription: false,
    },
    pro: {
        id: 'pro', name: 'Pro Pack', credits: 5000, priceUsd: 69.99, priceCents: 6999,
        stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
        description: 'Maximum output. Serious creators only.', popular: false,
        perCredit: '$0.014', isSubscription: false,
    },
    unlimited: {
        id: 'unlimited', name: 'Unlimited Monthly', credits: 10000, priceUsd: 99.99, priceCents: 9999,
        stripePriceId: process.env.STRIPE_PRICE_UNLIMITED || 'price_unlimited_placeholder',
        description: 'Monthly subscription. Resets every 30 days.', popular: false,
        perCredit: '$0.010', isSubscription: true,
    },
};

async function createCheckoutSession({ userId, packageId, successUrl, cancelUrl, userEmail }) {
    const pkg = CREDIT_PACKAGES[packageId];
    if (!pkg) throw new Error(`Invalid package: ${packageId}.`);

    const stripe = getStripe();

    const sessionConfig = {
        mode: pkg.isSubscription ? 'subscription' : 'payment',
        payment_method_types: ['card'],
        line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&package=${packageId}`,
        cancel_url: cancelUrl,
        metadata: {
            userId,
            packageId,
            credits: pkg.credits.toString(),
            noorProduct: 'credits',
        },
        client_reference_id: userId,
    };

    if (userEmail) sessionConfig.customer_email = userEmail;

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return { sessionId: session.id, checkoutUrl: session.url, package: pkg };
}

async function processWebhookEvent(event) {
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            if (session.payment_status !== 'paid') break;
            if (session.metadata?.noorProduct !== 'credits') break;
            return {
                action: 'add_credits',
                userId: session.metadata.userId,
                packageId: session.metadata.packageId,
                credits: parseInt(session.metadata.credits),
                sessionId: session.id,
                source: 'stripe_checkout',
            };
        }

        case 'invoice.payment_succeeded': {
            const invoice = event.data.object;
            if (invoice.billing_reason !== 'subscription_cycle') break;
            const subscription = await getStripe().subscriptions.retrieve(invoice.subscription);
            const pkg = Object.values(CREDIT_PACKAGES).find(
                p => p.stripePriceId === subscription.items.data[0]?.price?.id
            );
            if (!pkg) break;
            return {
                action: 'renewal_credits',
                userId: subscription.metadata?.userId || invoice.customer,
                packageId: pkg.id,
                credits: pkg.credits,
                invoiceId: invoice.id,
                source: 'stripe_renewal',
            };
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            return { action: 'subscription_cancelled', userId: subscription.metadata?.userId || subscription.customer };
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            return { action: 'payment_failed', userId: invoice.customer };
        }

        default:
            return { action: 'ignored', eventType: event.type };
    }

    return { action: 'ignored', eventType: event.type };
}

function verifyWebhookSignature(rawBody, signature) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

async function getCheckoutSession(sessionId) {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        userId: session.metadata?.userId,
        packageId: session.metadata?.packageId,
        credits: parseInt(session.metadata?.credits || 0),
        amountPaid: session.amount_total / 100,
        currency: session.currency,
    };
}

async function createPortalSession({ stripeCustomerId, returnUrl }) {
    const session = await getStripe().billingPortal.sessions.create({ customer: stripeCustomerId, return_url: returnUrl });
    return { portalUrl: session.url };
}

module.exports = {
    CREDIT_PACKAGES,
    createCheckoutSession,
    processWebhookEvent,
    verifyWebhookSignature,
    getCheckoutSession,
    createPortalSession,
};
