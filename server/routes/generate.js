// server/routes/generate.js
// NOOR AI — Generation Routes (HeyGen + Replicate + ElevenLabs)

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const heygen = require('../services/heygen');
const replicate = require('../services/replicate');
const elevenlabs = require('../services/elevenlabs');
const { canAfford, deductCredits, refundCredits } = require('../services/credits');
const { createJob, updateJob, startPolling } = require('../services/jobs');
const { uploadFile } = require('../services/storage');

// ── Credit check middleware ──────────────────────────────────────────────────
function requireCredits(toolName) {
    return (req, res, next) => {
        const userId = req.userId || req.headers['x-user-id'] || 'demo-user';
        req.userId = userId;
        try {
            const check = canAfford(userId, toolName);
            if (!check.canAfford) {
                return res.status(402).json({ error: 'insufficient_credits', message: `You need ${check.cost} credits but only have ${check.currentBalance}.`, shortfall: check.shortfall, cost: check.cost });
            }
            req.creditCost = check.cost;
            next();
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
}

// ── HeyGen dispatcher ────────────────────────────────────────────────────────
async function dispatchHeygenJob({ res, userId, toolName, creditCost, dispatchFn, pollFn }) {
    const jobId = uuidv4();
    deductCredits(userId, toolName, jobId);
    try {
        const provider = await dispatchFn();
        const job = createJob({ userId, tool: toolName, provider: 'heygen', providerJobId: provider.jobId, metadata: { creditCost } });
        startPolling(job.jobId, () => pollFn(provider.jobId), 6000, 60);
        return res.status(202).json({ success: true, jobId: job.jobId, providerJobId: provider.jobId, status: 'processing', creditsUsed: creditCost });
    } catch (err) {
        refundCredits(userId, toolName, jobId, 'dispatch_failed');
        return res.status(500).json({ error: 'dispatch_failed', message: err.message });
    }
}

// ── Replicate dispatcher ─────────────────────────────────────────────────────
async function dispatchReplicateJob({ res, userId, toolName, creditCost, dispatchFn }) {
    const jobId = uuidv4();
    deductCredits(userId, toolName, jobId);
    try {
        const { predictionId } = await dispatchFn();
        const job = createJob({ userId, tool: toolName, provider: 'replicate', providerJobId: predictionId, metadata: { creditCost } });
        startPolling(job.jobId, () => replicate.getPrediction(predictionId), 5000, 60);
        return res.status(202).json({ success: true, jobId: job.jobId, providerJobId: predictionId, status: 'processing', creditsUsed: creditCost });
    } catch (err) {
        refundCredits(userId, toolName, jobId, 'dispatch_failed');
        return res.status(500).json({ error: 'dispatch_failed', message: err.message });
    }
}

// ════════════════════════════════════════════════════════════════════════════
// HEYGEN TOOLS
// ════════════════════════════════════════════════════════════════════════════

router.post('/talking-photo', requireCredits('talking_photo'), async (req, res) => {
    const { photoUrl, audioUrl } = req.body;
    if (!photoUrl || !audioUrl) return res.status(400).json({ error: 'photoUrl and audioUrl are required.' });
    await dispatchHeygenJob({ res, userId: req.userId, toolName: 'talking_photo', creditCost: req.creditCost, dispatchFn: () => heygen.createTalkingPhoto({ photoUrl, audioUrl }), pollFn: (id) => heygen.getVideoStatus(id) });
});

router.post('/avatar-video', requireCredits('avatar_video'), async (req, res) => {
    const { avatarId, voiceId, script, backgroundUrl } = req.body;
    if (!avatarId || !voiceId || !script) return res.status(400).json({ error: 'avatarId, voiceId, and script are required.' });
    if (script.length > 3000) return res.status(400).json({ error: 'Script must be under 3000 characters.' });
    await dispatchHeygenJob({ res, userId: req.userId, toolName: 'avatar_video', creditCost: req.creditCost, dispatchFn: () => heygen.createAvatarVideo({ avatarId, voiceId, script, backgroundUrl }), pollFn: (id) => heygen.getVideoStatus(id) });
});

router.post('/lipsync', requireCredits('lipsync'), async (req, res) => {
    const { videoUrl, audioUrl } = req.body;
    if (!videoUrl || !audioUrl) return res.status(400).json({ error: 'videoUrl and audioUrl are required.' });
    await dispatchHeygenJob({ res, userId: req.userId, toolName: 'lipsync', creditCost: req.creditCost, dispatchFn: () => heygen.createLipsync({ videoUrl, audioUrl }), pollFn: (id) => heygen.getTranslateStatus(id) });
});

router.post('/video-translate', requireCredits('video_translate'), async (req, res) => {
    const { videoUrl, outputLanguage } = req.body;
    const SUPPORTED = ['es', 'fr', 'de', 'ar', 'zh', 'ja', 'ko', 'pt', 'hi', 'ru'];
    if (!videoUrl || !outputLanguage) return res.status(400).json({ error: 'videoUrl and outputLanguage are required.' });
    if (!SUPPORTED.includes(outputLanguage)) return res.status(400).json({ error: 'Unsupported language.', supported: SUPPORTED });
    await dispatchHeygenJob({ res, userId: req.userId, toolName: 'video_translate', creditCost: req.creditCost, dispatchFn: () => heygen.translateVideo({ videoUrl, outputLanguage }), pollFn: (id) => heygen.getTranslateStatus(id) });
});

router.get('/avatars', async (_req, res) => {
    try { res.json({ avatars: await heygen.listAvatars() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/voices', async (req, res) => {
    try { res.json({ voices: await heygen.listVoices({ language: req.query.language }) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// REPLICATE TOOLS
// ════════════════════════════════════════════════════════════════════════════

router.post('/face-swap', requireCredits('face_swap'), async (req, res) => {
    const { targetImageUrl, swapImageUrl } = req.body;
    if (!targetImageUrl || !swapImageUrl) return res.status(400).json({ error: 'targetImageUrl and swapImageUrl are required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'face_swap', creditCost: req.creditCost, dispatchFn: () => replicate.faceSwap({ targetImageUrl, swapImageUrl }) });
});

router.post('/ai-headshots', requireCredits('ai_headshots'), async (req, res) => {
    const { photoUrl, prompt, style } = req.body;
    if (!photoUrl) return res.status(400).json({ error: 'photoUrl is required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'ai_headshots', creditCost: req.creditCost, dispatchFn: () => replicate.aiHeadshots({ photoUrl, prompt, style }) });
});

router.post('/text-to-image', requireCredits('text_to_image'), async (req, res) => {
    const { prompt, style, width, height, numOutputs } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required.' });
    if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt must be under 1000 characters.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'text_to_image', creditCost: req.creditCost, dispatchFn: () => replicate.textToImage({ prompt, style, width, height, numOutputs }) });
});

router.post('/background-remove', requireCredits('background_remove'), async (req, res) => {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'background_remove', creditCost: req.creditCost, dispatchFn: () => replicate.backgroundRemove({ imageUrl }) });
});

router.post('/ai-animation', requireCredits('ai_animation'), async (req, res) => {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'ai_animation', creditCost: req.creditCost, dispatchFn: () => replicate.aiAnimation({ imageUrl }) });
});

router.post('/image-upscaler', requireCredits('image_upscaler'), async (req, res) => {
    const { imageUrl, scale } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required.' });
    if (scale && ![2, 4].includes(Number(scale))) return res.status(400).json({ error: 'scale must be 2 or 4.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'image_upscaler', creditCost: req.creditCost, dispatchFn: () => replicate.imageUpscaler({ imageUrl, scale: Number(scale) || 4 }) });
});

router.post('/style-transfer', requireCredits('style_transfer'), async (req, res) => {
    const { contentUrl, stylePrompt } = req.body;
    if (!contentUrl) return res.status(400).json({ error: 'contentUrl is required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'style_transfer', creditCost: req.creditCost, dispatchFn: () => replicate.styleTransfer({ contentUrl, stylePrompt }) });
});

router.post('/video-to-video', requireCredits('video_to_video'), async (req, res) => {
    const { videoUrl, prompt, strength } = req.body;
    if (!videoUrl || !prompt) return res.status(400).json({ error: 'videoUrl and prompt are required.' });
    await dispatchReplicateJob({ res, userId: req.userId, toolName: 'video_to_video', creditCost: req.creditCost, dispatchFn: () => replicate.videoToVideo({ videoUrl, prompt, strength }) });
});

// ════════════════════════════════════════════════════════════════════════════
// ELEVENLABS TOOLS
// ════════════════════════════════════════════════════════════════════════════

router.post('/text-to-speech', requireCredits('text_to_speech'), async (req, res) => {
    const { text, voiceId, model } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required.' });
    if (text.length > 5000) return res.status(400).json({ error: 'Text must be under 5000 characters.' });

    const userId = req.userId;
    const jobId = uuidv4();
    deductCredits(userId, 'text_to_speech', jobId);
    try {
        const { audioBuffer, mimeType } = await elevenlabs.textToSpeech({ text, voiceId, model });
        const stored = await uploadFile({ fileBuffer: audioBuffer, mimeType, userId, originalName: 'tts.mp3' });
        const job = createJob({ userId, tool: 'text_to_speech', provider: 'elevenlabs', providerJobId: jobId, metadata: {} });
        updateJob(job.jobId, { status: 'completed', outputUrl: stored.url });
        return res.json({ success: true, jobId: job.jobId, status: 'completed', outputUrl: stored.url, creditsUsed: req.creditCost });
    } catch (err) {
        refundCredits(userId, 'text_to_speech', jobId, 'generation_failed');
        return res.status(500).json({ error: err.message });
    }
});

router.post('/voice-clone', requireCredits('voice_clone'), async (req, res) => {
    const { audioUrl, name } = req.body;
    if (!audioUrl || !name) return res.status(400).json({ error: 'audioUrl and name are required.' });

    const userId = req.userId;
    const jobId = uuidv4();
    deductCredits(userId, 'voice_clone', jobId);
    try {
        const result = await elevenlabs.cloneVoice({ audioUrl, name });
        const job = createJob({ userId, tool: 'voice_clone', provider: 'elevenlabs', providerJobId: result.voiceId, metadata: { voiceId: result.voiceId } });
        updateJob(job.jobId, { status: 'completed', outputUrl: null });
        return res.json({ success: true, jobId: job.jobId, status: 'completed', voiceId: result.voiceId, creditsUsed: req.creditCost });
    } catch (err) {
        refundCredits(userId, 'voice_clone', jobId, 'generation_failed');
        return res.status(500).json({ error: err.message });
    }
});

router.get('/el-voices', async (_req, res) => {
    try { res.json({ voices: await elevenlabs.listVoices() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
