// server/services/credits.js
// NOOR AI Credit System

// Admin user IDs — bypass all credit deductions
const ADMIN_IDS = new Set(
    (process.env.ADMIN_USER_IDS || 'admin').split(',').map(s => s.trim())
);

function isAdmin(userId) {
    return ADMIN_IDS.has(userId);
}

const CREDIT_COSTS = {
    talking_photo: 6,
    avatar_video: 10,
    lipsync: 8,
    video_translate: 12,
    face_swap: 4,
    ai_headshots: 8,
    text_to_image: 2,
    background_remove: 1,
    voice_clone: 5,
    text_to_speech: 3,
    ai_animation: 10,
    image_upscaler: 3,
    style_transfer: 4,
    video_to_video: 12,
};

// In-memory store (swap for DB in production)
const userStore = new Map();

function initUser(userId, startingCredits = 100, plan = 'free') {
    if (!userStore.has(userId)) {
        userStore.set(userId, {
            userId,
            credits: startingCredits,
            plan,
            isAdmin: isAdmin(userId),
            history: [],
            createdAt: new Date().toISOString(),
        });
    }
    return userStore.get(userId);
}

function initAdmin() {
    const adminId = process.env.ADMIN_USER_IDS?.split(',')[0]?.trim() || 'admin';
    if (!userStore.has(adminId)) {
        userStore.set(adminId, {
            userId: adminId,
            credits: Infinity,
            plan: 'owner',
            isAdmin: true,
            history: [],
            createdAt: new Date().toISOString(),
        });
        console.log(`[NOOR] Admin account initialised: ${adminId}`);
    }
    return userStore.get(adminId);
}

function getBalance(userId) {
    const user = userStore.get(userId);
    if (!user) return null;
    return {
        userId,
        credits: isAdmin(userId) ? Infinity : user.credits,
        plan: user.plan,
        isAdmin: isAdmin(userId),
    };
}

function canAfford(userId, toolName) {
    const cost = CREDIT_COSTS[toolName];
    if (!cost) throw new Error(`Unknown tool: ${toolName}`);

    // Admin always can afford anything
    if (isAdmin(userId)) return { canAfford: true, cost, currentBalance: Infinity, shortfall: 0 };

    const user = userStore.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    return {
        canAfford: user.credits >= cost,
        cost,
        currentBalance: user.credits,
        shortfall: Math.max(0, cost - user.credits),
    };
}

function deductCredits(userId, toolName, jobId) {
    const cost = CREDIT_COSTS[toolName];
    if (!cost) throw new Error(`Unknown tool: ${toolName}`);

    // Admin: log but don't deduct
    if (isAdmin(userId)) {
        return { debited: 0, newBalance: Infinity, adminBypass: true };
    }

    const user = userStore.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    if (user.credits < cost) {
        throw new Error(`Insufficient credits. Need ${cost}, have ${user.credits}.`);
    }

    user.credits -= cost;
    user.history.push({
        jobId, tool: toolName, cost,
        balanceAfter: user.credits,
        timestamp: new Date().toISOString(),
        status: 'debited',
    });

    userStore.set(userId, user);
    return { debited: cost, newBalance: user.credits };
}

function refundCredits(userId, toolName, jobId, reason = 'job_failed') {
    // Admin: no-op
    if (isAdmin(userId)) return { refunded: 0, newBalance: Infinity, adminBypass: true };

    const cost = CREDIT_COSTS[toolName];
    const user = userStore.get(userId);
    if (!user) return;

    user.credits += cost;
    user.history.push({
        jobId, tool: toolName, refund: cost,
        balanceAfter: user.credits,
        timestamp: new Date().toISOString(),
        status: 'refunded', reason,
    });

    userStore.set(userId, user);
    return { refunded: cost, newBalance: user.credits };
}

function addCredits(userId, amount, source = 'purchase') {
    const user = userStore.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    user.credits += amount;

    user.history.push({
        tool: 'credit_purchase',
        added: amount,
        balanceAfter: user.credits,
        timestamp: new Date().toISOString(),
        status: 'credited',
        source,
    });

    userStore.set(userId, user);
    return { added: amount, newBalance: user.credits };
}

function getHistory(userId, limit = 20) {
    const user = userStore.get(userId);
    if (!user) return [];
    return user.history.slice(-limit).reverse();
}

const PLAN_CREDITS = {
    free: 100,
    starter: 500,
    pro: 2000,
    unlimited: 10000,
};

function applyPlanCredits(userId, plan) {
    const amount = PLAN_CREDITS[plan];
    if (!amount) throw new Error(`Unknown plan: ${plan}`);

    const user = userStore.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    user.plan = plan;
    user.credits = amount;

    userStore.set(userId, user);
    return { plan, newBalance: user.credits };
}

module.exports = {
    CREDIT_COSTS,
    PLAN_CREDITS,
    isAdmin,
    initUser,
    initAdmin,
    getBalance,
    canAfford,
    deductCredits,
    refundCredits,
    addCredits,
    getHistory,
    applyPlanCredits,
};
