// server/services/storage.js
// NOOR AI — File Storage Service
// Uses AWS S3 / Cloudflare R2 in production, local disk in development

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const IS_PROD = process.env.NODE_ENV === 'production';
const USE_S3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_S3_BUCKET);

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

let s3Client = null;

function getS3Client() {
    if (s3Client) return s3Client;
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        ...(process.env.AWS_S3_ENDPOINT ? { endpoint: process.env.AWS_S3_ENDPOINT } : {}),
    });
    return s3Client;
}

const ALLOWED_TYPES = {
    image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a'],
    video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi'],
};

const MAX_SIZES = {
    image: 10 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
    video: 200 * 1024 * 1024,
};

function detectFileCategory(mimeType) {
    for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
        if (types.includes(mimeType)) return category;
    }
    return null;
}

function validateFile(fileBuffer, mimeType) {
    const category = detectFileCategory(mimeType);
    if (!category) throw new Error(`File type not allowed: ${mimeType}`);
    if (fileBuffer.length > MAX_SIZES[category]) {
        const mb = Math.round(MAX_SIZES[category] / 1024 / 1024);
        throw new Error(`File too large. Max size for ${category}: ${mb}MB`);
    }
    return category;
}

function extFromMime(mimeType) {
    const map = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
        'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
        'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/avi': 'avi',
    };
    return map[mimeType] || 'bin';
}

async function uploadToS3({ fileBuffer, mimeType, userId, folder }) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const ext = extFromMime(mimeType);
    const fileKey = `${folder}/${userId}/${uuidv4()}.${ext}`;
    const bucket = process.env.AWS_S3_BUCKET;

    await getS3Client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: 'public-read',
    }));

    const baseUrl = process.env.AWS_S3_ENDPOINT
        ? `${process.env.AWS_S3_ENDPOINT}/${bucket}`
        : `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;

    return { key: fileKey, url: `${baseUrl}/${fileKey}`, size: fileBuffer.length, mimeType };
}

async function saveToLocal({ fileBuffer, mimeType, userId, folder }) {
    const ext = extFromMime(mimeType);
    const fileName = `${uuidv4()}.${ext}`;
    const dir = path.join(LOCAL_UPLOAD_DIR, folder, userId);

    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, fileBuffer);

    const fileKey = `${folder}/${userId}/${fileName}`;
    const baseUrl = `http://localhost:${process.env.PORT || 3001}`;

    return { key: fileKey, url: `${baseUrl}/uploads/${fileKey}`, size: fileBuffer.length, mimeType };
}

async function uploadFile({ fileBuffer, mimeType, userId, originalName = '' }) {
    const category = validateFile(fileBuffer, mimeType);

    let processedBuffer = fileBuffer;
    if (category === 'image') {
        try {
            const sharp = require('sharp');
            processedBuffer = await sharp(fileBuffer)
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .toBuffer();
        } catch {
            processedBuffer = fileBuffer;
        }
    }

    const folder = category;
    const result = USE_S3
        ? await uploadToS3({ fileBuffer: processedBuffer, mimeType, userId, folder })
        : await saveToLocal({ fileBuffer: processedBuffer, mimeType, userId, folder });

    return { ...result, category, originalName, uploadedAt: new Date().toISOString() };
}

async function deleteFile(fileKey) {
    if (USE_S3) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        await getS3Client().send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: fileKey }));
    } else {
        const localPath = path.join(LOCAL_UPLOAD_DIR, fileKey);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
}

async function getPresignedUploadUrl({ mimeType, userId, folder, expiresIn = 300 }) {
    if (!USE_S3) throw new Error('Presigned URLs only available with S3 configured.');

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const ext = extFromMime(mimeType);
    const fileKey = `${folder}/${userId}/${uuidv4()}.${ext}`;
    const bucket = process.env.AWS_S3_BUCKET;

    const command = new PutObjectCommand({ Bucket: bucket, Key: fileKey, ContentType: mimeType });
    const signedUrl = await getSignedUrl(getS3Client(), command, { expiresIn });

    const baseUrl = process.env.AWS_S3_ENDPOINT
        ? `${process.env.AWS_S3_ENDPOINT}/${bucket}`
        : `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;

    return { uploadUrl: signedUrl, fileKey, publicUrl: `${baseUrl}/${fileKey}`, expiresIn };
}

module.exports = {
    uploadFile,
    deleteFile,
    getPresignedUploadUrl,
    validateFile,
    detectFileCategory,
    ALLOWED_TYPES,
    MAX_SIZES,
    LOCAL_UPLOAD_DIR,
};
