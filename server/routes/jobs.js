// server/routes/jobs.js
// NOOR AI — Job Status + Credit Endpoints

const express = require('express');
const router = express.Router();

const { getJob, getUserJobs } = require('../services/jobs');
const { getBalance, getHistory } = require('../services/credits');

// GET /api/jobs/:jobId — Poll for job status
router.get('/:jobId', (req, res) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    const job = getJob(req.params.jobId);

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.userId !== userId) return res.status(403).json({ error: 'Access denied.' });

    return res.json(job);
});

// GET /api/jobs — All jobs for current user
router.get('/', (req, res) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    const limit = parseInt(req.query.limit) || 20;
    const jobs = getUserJobs(userId, limit);
    return res.json({ jobs });
});

// GET /api/jobs/credits/balance
router.get('/credits/balance', (req, res) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    const balance = getBalance(userId);
    if (!balance) return res.status(404).json({ error: 'User not found.' });
    return res.json(balance);
});

// GET /api/jobs/credits/history
router.get('/credits/history', (req, res) => {
    const userId = req.headers['x-user-id'] || 'demo-user';
    const history = getHistory(userId, 20);
    return res.json({ history });
});

module.exports = router;
