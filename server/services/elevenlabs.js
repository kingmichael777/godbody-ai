// server/services/elevenlabs.js
// ElevenLabs API wrapper for NOOR AI

const axios = require('axios');

const EL_BASE = 'https://api.elevenlabs.io/v1';
const API_KEY = process.env.ELEVENLABS_API_KEY;

function elClient(responseType = 'json') {
    return axios.create({
        baseURL: EL_BASE,
        responseType,
        headers: {
            'xi-api-key': API_KEY,
            'Content-Type': 'application/json',
        },
    });
}

// List all available voices
async function listVoices() {
    const res = await elClient().get('/voices');
    return (res.data.voices || []).map(v => ({
        voiceId: v.voice_id,
        name: v.name,
        labels: v.labels,
        preview: v.preview_url,
        category: v.category,
    }));
}

// Convert text to speech — returns a Buffer of audio data
async function textToSpeech({ text, voiceId = '21m00Tcm4TlvDq8ikWAM', model = 'eleven_turbo_v2' }) {
    if (!text || text.length === 0) throw new Error('text is required.');
    if (text.length > 5000) throw new Error('Text must be under 5000 characters.');

    const res = await elClient('arraybuffer').post(`/text-to-speech/${voiceId}`, {
        text,
        model_id: model,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
        },
    });

    return { audioBuffer: Buffer.from(res.data), mimeType: 'audio/mpeg', voiceId };
}

// Clone a voice from audio — returns the new voice ID
async function cloneVoice({ audioUrl, name, description = 'NOOR AI cloned voice' }) {
    const FormData = require('form-data');
    const { default: fetch } = require('node-fetch');

    // Download the audio to a buffer first
    const audioRes = await fetch(audioUrl);
    const audioData = Buffer.from(await audioRes.arrayBuffer());

    const form = new FormData();
    form.append('name', name);
    form.append('description', description);
    form.append('files', audioData, { filename: 'sample.mp3', contentType: 'audio/mpeg' });

    const res = await axios.post(`${EL_BASE}/voices/add`, form, {
        headers: { ...form.getHeaders(), 'xi-api-key': API_KEY },
    });

    return { voiceId: res.data.voice_id, name };
}

// Delete a cloned voice
async function deleteVoice(voiceId) {
    await elClient().delete(`/voices/${voiceId}`);
    return { deleted: true, voiceId };
}

// Get ElevenLabs remaining character quota
async function getQuota() {
    const res = await elClient().get('/user/subscription');
    return {
        characterCount: res.data.character_count,
        characterLimit: res.data.character_limit,
        remainingCharacters: res.data.character_limit - res.data.character_count,
        tier: res.data.tier,
    };
}

module.exports = { listVoices, textToSpeech, cloneVoice, deleteVoice, getQuota };
