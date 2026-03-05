// server/routes/upload.js
// NOOR AI — File Upload Routes

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { uploadFile, getPresignedUploadUrl, ALLOWED_TYPES, MAX_SIZES } = require('../services/storage');
const heygen = require('../services/heygen');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024, files: 2 },
    fileFilter: (_req, file, cb) => {
        const allowed = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.audio, ...ALLOWED_TYPES.video];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`), false);
        }
    },
});

// POST /api/upload/file — single file
router.post('/file', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided. Use field name: "file"' });

    const userId = req.headers['x-user-id'] || 'demo-user';

    try {
        const result = await uploadFile({
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            userId,
            originalName: req.file.originalname,
        });

        return res.json({
            success: true,
            file: {
                url: result.url,
                key: result.key,
                category: result.category,
                size: result.size,
                mimeType: result.mimeType,
                originalName: result.originalName,
                uploadedAt: result.uploadedAt,
            },
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/upload/pair — photo + audio together
router.post('/pair', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
]), async (req, res) => {
    const photoFile = req.files?.photo?.[0];
    const audioFile = req.files?.audio?.[0];

    if (!photoFile && !audioFile) {
        return res.status(400).json({ error: 'Provide at least one file. Fields: "photo" and/or "audio"' });
    }

    const userId = req.headers['x-user-id'] || 'demo-user';
    const results = {};

    try {
        if (photoFile) {
            if (!ALLOWED_TYPES.image.includes(photoFile.mimetype)) {
                return res.status(400).json({ error: `Photo must be an image. Got: ${photoFile.mimetype}` });
            }
            results.photo = await uploadFile({ fileBuffer: photoFile.buffer, mimeType: photoFile.mimetype, userId, originalName: photoFile.originalname });
        }
        if (audioFile) {
            if (!ALLOWED_TYPES.audio.includes(audioFile.mimetype)) {
                return res.status(400).json({ error: `Audio must be an audio file. Got: ${audioFile.mimetype}` });
            }
            results.audio = await uploadFile({ fileBuffer: audioFile.buffer, mimeType: audioFile.mimetype, userId, originalName: audioFile.originalname });
        }

        return res.json({ success: true, photoUrl: results.photo?.url || null, audioUrl: results.audio?.url || null, files: results });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/upload/to-heygen — upload directly to HeyGen asset storage
router.post('/to-heygen', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    try {
        const result = await heygen.uploadAsset({
            fileBuffer: req.file.buffer,
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
        });
        return res.json({ success: true, assetId: result.assetId, url: result.url });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/upload/presign — presigned S3 URL for large file uploads
router.get('/presign', async (req, res) => {
    const { mimeType, folder } = req.query;
    const userId = req.headers['x-user-id'] || 'demo-user';

    if (!mimeType || !folder) return res.status(400).json({ error: 'mimeType and folder query params required.' });
    if (!['image', 'audio', 'video'].includes(folder)) return res.status(400).json({ error: 'folder must be: image, audio, or video' });

    try {
        const result = await getPresignedUploadUrl({ mimeType, userId, folder });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/upload/limits
router.get('/limits', (_req, res) => {
    return res.json({
        allowedTypes: ALLOWED_TYPES,
        maxSizes: {
            image: `${MAX_SIZES.image / 1024 / 1024}MB`,
            audio: `${MAX_SIZES.audio / 1024 / 1024}MB`,
            video: `${MAX_SIZES.video / 1024 / 1024}MB`,
        },
    });
});

// Multer error handler
router.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large.' });
    return res.status(400).json({ error: err.message });
});

module.exports = router;
