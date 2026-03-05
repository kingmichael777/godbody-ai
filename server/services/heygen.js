// server/services/heygen.js
// All HeyGen API integrations for NOOR AI

const axios = require('axios');

const HEYGEN_BASE = process.env.HEYGEN_API_URL || 'https://api.heygen.com';
const API_KEY = process.env.HEYGEN_API_KEY;

const heygenClient = axios.create({
    baseURL: HEYGEN_BASE,
    headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json',
    },
});

// ─────────────────────────────────────────────
// TALKING PHOTO
// Upload a photo + audio → animated talking video
// ─────────────────────────────────────────────
async function createTalkingPhoto({ photoUrl, audioUrl, title = 'NOOR AI Generation' }) {
    const response = await heygenClient.post('/v1/talking_photo', {
        talking_photo_id: null,
        input_image_asset_id: null,
        talking_photo_style: 'stable',
        talking_style: 'expressive',
        expression_scale: 1.0,
        movement_amplitude: 'auto',
        voice: {
            type: 'audio',
            audio_url: audioUrl,
        },
        image_url: photoUrl,
        title,
        callback_id: null,
    });

    return {
        jobId: response.data?.data?.video_id,
        status: 'processing',
        provider: 'heygen',
        tool: 'talking_photo',
    };
}

// ─────────────────────────────────────────────
// AVATAR VIDEO (Text-driven talking avatar)
// ─────────────────────────────────────────────
async function createAvatarVideo({ avatarId, voiceId, script, backgroundUrl = null }) {
    const response = await heygenClient.post('/v2/video/generate', {
        video_inputs: [
            {
                character: {
                    type: 'avatar',
                    avatar_id: avatarId,
                    avatar_style: 'normal',
                },
                voice: {
                    type: 'text',
                    input_text: script,
                    voice_id: voiceId,
                    speed: 1.0,
                },
                background: backgroundUrl
                    ? { type: 'image', url: backgroundUrl }
                    : { type: 'color', value: '#1a1a2e' },
            },
        ],
        dimension: { width: 1280, height: 720 },
        test: false,
        caption: false,
    });

    return {
        jobId: response.data?.data?.video_id,
        status: 'processing',
        provider: 'heygen',
        tool: 'avatar_video',
    };
}

// ─────────────────────────────────────────────
// LIPSYNC
// Upload a video + audio → resynced mouth movement
// ─────────────────────────────────────────────
async function createLipsync({ videoUrl, audioUrl }) {
    const response = await heygenClient.post('/v1/video_translate', {
        video_url: videoUrl,
        audio_url: audioUrl,
        title: 'NOOR Lipsync',
    });

    return {
        jobId: response.data?.data?.video_translate_id,
        status: 'processing',
        provider: 'heygen',
        tool: 'lipsync',
    };
}

// ─────────────────────────────────────────────
// VIDEO TRANSLATION
// Translate video speech to another language
// ─────────────────────────────────────────────
async function translateVideo({ videoUrl, outputLanguage, title = 'NOOR Translation' }) {
    const response = await heygenClient.post('/v1/video_translate', {
        video_url: videoUrl,
        output_language: outputLanguage,
        title,
        translate_audio_only: false,
    });

    return {
        jobId: response.data?.data?.video_translate_id,
        status: 'processing',
        provider: 'heygen',
        tool: 'video_translate',
    };
}

// ─────────────────────────────────────────────
// LIST AVAILABLE AVATARS
// ─────────────────────────────────────────────
async function listAvatars() {
    const response = await heygenClient.get('/v2/avatars');
    return response.data?.data?.avatars || [];
}

// ─────────────────────────────────────────────
// LIST AVAILABLE VOICES
// ─────────────────────────────────────────────
async function listVoices({ language = null } = {}) {
    const params = language ? { language } : {};
    const response = await heygenClient.get('/v2/voices', { params });
    return response.data?.data?.voices || [];
}

// ─────────────────────────────────────────────
// POLL JOB STATUS (video jobs)
// ─────────────────────────────────────────────
async function getVideoStatus(videoId) {
    const response = await heygenClient.get(`/v1/video_status.get`, {
        params: { video_id: videoId },
    });

    const data = response.data?.data;

    return {
        jobId: videoId,
        status: data?.status,           // 'processing' | 'completed' | 'failed'
        outputUrl: data?.video_url || null,
        thumbnailUrl: data?.thumbnail_url || null,
        duration: data?.duration || null,
        error: data?.error || null,
    };
}

// Status for translation/lipsync jobs
async function getTranslateStatus(translateId) {
    const response = await heygenClient.get(`/v1/video_translate/${translateId}`);
    const data = response.data?.data;

    return {
        jobId: translateId,
        status: data?.status,
        outputUrl: data?.url || null,
        error: data?.error || null,
    };
}

// ─────────────────────────────────────────────
// UPLOAD ASSET TO HEYGEN
// ─────────────────────────────────────────────
async function uploadAsset({ fileBuffer, fileType, fileName }) {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileBuffer, { filename: fileName, contentType: fileType });

    const response = await axios.post(`${HEYGEN_BASE}/v1/asset`, form, {
        headers: {
            ...form.getHeaders(),
            'X-Api-Key': API_KEY,
        },
    });

    return {
        assetId: response.data?.data?.asset_id,
        url: response.data?.data?.url,
    };
}

// ─────────────────────────────────────────────
// REMAINING CREDITS
// ─────────────────────────────────────────────
async function getRemainingCredits() {
    const response = await heygenClient.get('/v1/user/remaining_quota');
    return response.data?.data?.remaining_quota || 0;
}

module.exports = {
    createTalkingPhoto,
    createAvatarVideo,
    createLipsync,
    translateVideo,
    listAvatars,
    listVoices,
    getVideoStatus,
    getTranslateStatus,
    uploadAsset,
    getRemainingCredits,
};
