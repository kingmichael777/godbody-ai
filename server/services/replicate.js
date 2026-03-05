// server/services/replicate.js
// Replicate API wrapper for NOOR AI

const axios = require('axios');

const REPLICATE_BASE = 'https://api.replicate.com/v1';
const API_KEY = process.env.REPLICATE_API_KEY;

function replicateClient() {
    return axios.create({
        baseURL: REPLICATE_BASE,
        headers: {
            Authorization: `Token ${API_KEY}`,
            'Content-Type': 'application/json',
        },
    });
}

// Create a prediction using the latest model version (no version hash needed)
async function predict(modelSlug, input) {
    try {
        const response = await replicateClient().post('/models/' + modelSlug + '/predictions', {
            input,
        });
        return {
            predictionId: response.data.id,
            status: response.data.status,
            urls: response.data.urls,
        };
    } catch (err) {
        const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
        console.error(`[Replicate] predict error for ${modelSlug}:`, msg);
        throw new Error(msg || 'Replicate API error');
    }
}

// Poll a single prediction for status
async function getPrediction(predictionId) {
    const response = await replicateClient().get(`/predictions/${predictionId}`);
    const data = response.data;

    let status = 'processing';
    if (data.status === 'succeeded') status = 'completed';
    if (data.status === 'failed') status = 'failed';
    if (data.status === 'canceled') status = 'failed';

    const output = data.output;
    let outputUrl = null;
    if (output) {
        outputUrl = Array.isArray(output) ? output[0] : output;
    }

    return {
        predictionId,
        status,
        outputUrl,
        error: data.error || null,
        metrics: data.metrics || null,
    };
}

// ─────────────────────────────────────────────
// Individual tool helpers
// ─────────────────────────────────────────────

async function faceSwap({ targetImageUrl, swapImageUrl }) {
    return predict('lucataco/faceswap', {
        target_image: targetImageUrl,
        swap_image: swapImageUrl,
    });
}

async function aiHeadshots({ photoUrl, prompt = 'professional corporate headshot, studio lighting', style = 'Photographic' }) {
    return predict('tencentarc/photomaker', {
        prompt,
        input_image: photoUrl,
        style_name: style,
        num_outputs: 1,
        num_steps: 50,
        style_strength_ratio: 20,
    });
}

async function textToImage({ prompt, style = 'realistic', width = 1024, height = 1024, numOutputs = 1 }) {
    return predict('black-forest-labs/flux-schnell', {
        prompt,
        width,
        height,
        num_outputs: numOutputs,
        num_inference_steps: 4,
        guidance_scale: 0,
        output_format: 'webp',
        output_quality: 90,
    });
}

async function backgroundRemove({ imageUrl }) {
    return predict('cjwbw/rembg', {
        image: imageUrl,
        model: 'u2net',
    });
}

async function aiAnimation({ imageUrl }) {
    return predict('stability-ai/stable-video-diffusion', {
        input_image: imageUrl,
        video_length: '25_frames_with_svd_xt',
        sizing_strategy: 'maintain_aspect_ratio',
        frames_per_second: 6,
        motion_bucket_id: 127,
        cond_aug: 0.02,
        decoding_t: 14,
        output_video_codec: 'h264',
    });
}

async function imageUpscaler({ imageUrl, scale = 4 }) {
    return predict('nightmareai/real-esrgan', {
        image: imageUrl,
        scale,
        face_enhance: false,
    });
}

async function styleTransfer({ contentUrl, stylePrompt = 'oil painting, impressionist style' }) {
    return predict('fofr/style-transfer', {
        content_image: contentUrl,
        style_prompt: stylePrompt,
        content_strength: 0.6,
        output_format: 'webp',
    });
}

async function videoToVideo({ videoUrl, prompt, strength = 0.7 }) {
    return predict('fofr/video-to-video', {
        video: videoUrl,
        prompt,
        strength,
        output_format: 'mp4',
    });
}

module.exports = {
    predict,
    getPrediction,
    faceSwap,
    aiHeadshots,
    textToImage,
    backgroundRemove,
    aiAnimation,
    imageUpscaler,
    styleTransfer,
    videoToVideo,
};
