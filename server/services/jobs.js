// server/services/jobs.js
// NOOR AI Job Queue — Async tracking for all AI generation tasks

const { v4: uuidv4 } = require('uuid');
const { refundCredits } = require('./credits');

// In-memory job store (swap for Redis in production)
const jobStore = new Map();

const STATUS = {
    QUEUED: 'queued',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

function createJob({ userId, tool, provider, providerJobId, metadata = {} }) {
    const jobId = uuidv4();
    const job = {
        jobId,
        userId,
        tool,
        provider,
        providerJobId,
        status: STATUS.QUEUED,
        outputUrl: null,
        thumbnailUrl: null,
        error: null,
        metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
    };

    jobStore.set(jobId, job);
    return job;
}

function getJob(jobId) {
    return jobStore.get(jobId) || null;
}

function updateJob(jobId, updates) {
    const job = jobStore.get(jobId);
    if (!job) return null;

    const updated = {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    if (updates.status === STATUS.COMPLETED || updates.status === STATUS.FAILED) {
        updated.completedAt = new Date().toISOString();
    }

    jobStore.set(jobId, updated);
    return updated;
}

function getUserJobs(userId, limit = 20) {
    const jobs = [];
    for (const job of jobStore.values()) {
        if (job.userId === userId) jobs.push(job);
    }
    return jobs
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

// ─────────────────────────────────────────────
// POLLING WORKER
// Polls the provider for status every N seconds
// In production: use BullMQ + Redis
// ─────────────────────────────────────────────
const activePollers = new Map();

function startPolling(jobId, pollFn, intervalMs = 5000, maxAttempts = 60) {
    let attempts = 0;

    const interval = setInterval(async () => {
        attempts++;

        try {
            const result = await pollFn();

            if (result.status === 'completed') {
                updateJob(jobId, {
                    status: STATUS.COMPLETED,
                    outputUrl: result.outputUrl,
                    thumbnailUrl: result.thumbnailUrl || null,
                    duration: result.duration || null,
                });
                clearInterval(interval);
                activePollers.delete(jobId);
                console.log(`[NOOR] Job ${jobId} completed.`);
            } else if (result.status === 'failed') {
                const job = getJob(jobId);
                updateJob(jobId, {
                    status: STATUS.FAILED,
                    error: result.error || 'Generation failed at provider.',
                });
                if (job) {
                    refundCredits(job.userId, job.tool, jobId, 'provider_failure');
                    console.log(`[NOOR] Refunded credits for failed job ${jobId}`);
                }
                clearInterval(interval);
                activePollers.delete(jobId);
            } else {
                updateJob(jobId, { status: STATUS.PROCESSING });
            }
        } catch (err) {
            console.error(`[NOOR] Polling error for job ${jobId}:`, err.message);

            if (attempts >= maxAttempts) {
                const job = getJob(jobId);
                updateJob(jobId, {
                    status: STATUS.FAILED,
                    error: 'Job timed out after maximum polling attempts.',
                });
                if (job) {
                    refundCredits(job.userId, job.tool, jobId, 'timeout');
                }
                clearInterval(interval);
                activePollers.delete(jobId);
            }
        }
    }, intervalMs);

    activePollers.set(jobId, interval);
    return interval;
}

function stopPolling(jobId) {
    const interval = activePollers.get(jobId);
    if (interval) {
        clearInterval(interval);
        activePollers.delete(jobId);
    }
}

module.exports = {
    STATUS,
    createJob,
    getJob,
    updateJob,
    getUserJobs,
    startPolling,
    stopPolling,
};
