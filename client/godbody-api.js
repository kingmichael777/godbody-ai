// client/GODBODY-api.js
// Godbody AI Frontend API Client

const BACKEND_URL = 'http://localhost:3001';

// Session: reads from localStorage so admin logins persist across pages
function getUserId() {
    return localStorage.getItem('noor_user_id') || 'demo-user';
}
function isAdminSession() {
    return localStorage.getItem('noor_is_admin') === 'true';
}

async function noorFetch(path, options = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': getUserId(),
            ...(options.headers || {}),
        },
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { status: res.status, data });
    return data;
}

async function pollUntilComplete(jobId, { onProgress, intervalMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const job = await noorFetch(`/api/jobs/${jobId}`);
                if (onProgress) onProgress(job);
                if (job.status === 'completed') { clearInterval(interval); resolve(job); }
                else if (job.status === 'failed') { clearInterval(interval); reject(new Error(job.error || 'Job failed.')); }
            } catch (err) { clearInterval(interval); reject(err); }
        }, intervalMs);
    });
}

async function generateTalkingPhoto({ photoUrl, audioUrl, onProgress }) {
    const { jobId } = await noorFetch('/api/generate/talking-photo', { method: 'POST', body: JSON.stringify({ photoUrl, audioUrl }) });
    return pollUntilComplete(jobId, { onProgress });
}

async function generateAvatarVideo({ avatarId, voiceId, script, backgroundUrl, onProgress }) {
    const { jobId } = await noorFetch('/api/generate/avatar-video', { method: 'POST', body: JSON.stringify({ avatarId, voiceId, script, backgroundUrl }) });
    return pollUntilComplete(jobId, { onProgress });
}

async function generateLipsync({ videoUrl, audioUrl, onProgress }) {
    const { jobId } = await noorFetch('/api/generate/lipsync', { method: 'POST', body: JSON.stringify({ videoUrl, audioUrl }) });
    return pollUntilComplete(jobId, { onProgress });
}

async function translateVideo({ videoUrl, outputLanguage, onProgress }) {
    const { jobId } = await noorFetch('/api/generate/video-translate', { method: 'POST', body: JSON.stringify({ videoUrl, outputLanguage }) });
    return pollUntilComplete(jobId, { onProgress });
}

async function getAvatars() { return noorFetch('/api/generate/avatars'); }
async function getVoices(language = null) { return noorFetch(`/api/generate/voices${language ? '?language=' + language : ''}`); }
async function getCreditBalance() { return noorFetch('/api/jobs/credits/balance'); }
async function getCreditHistory() { return noorFetch('/api/jobs/credits/history'); }
async function getMyJobs(limit = 20) { return noorFetch(`/api/jobs?limit=${limit}`); }
async function getJob(jobId) { return noorFetch(`/api/jobs/${jobId}`); }

// Browser export
if (typeof window !== 'undefined') {
    window.NoorAPI = { generateTalkingPhoto, generateAvatarVideo, generateLipsync, translateVideo, getAvatars, getVoices, getCreditBalance, getCreditHistory, getMyJobs, getJob };
}

// Node export
if (typeof module !== 'undefined') {
    module.exports = { generateTalkingPhoto, generateAvatarVideo, generateLipsync, translateVideo, getAvatars, getVoices, getCreditBalance, getCreditHistory, getMyJobs, getJob, pollUntilComplete };
}
