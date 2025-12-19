const Document = require('../models/Document');
const { uploadFileToS3, deleteFileFromS3 } = require('../utils/s3');
const { extractTextFromFile, extractTextFromUrl } = require('../rag/extractor');
const { splitText } = require('../rag/splitter');
const { generateEmbeddings } = require('../rag/embeddings');
const { upsertVectors, deleteVectors } = require('../rag/vectorStore');
const fs = require('fs');

const processDocument = async (doc, orgId, geminiApiKey) => {
    try {
        doc.status = 'processing';
        await doc.save();

        let text = '';
        if (doc.type === 'file') {
            // We need the mime type, which we can store or guess. 
            // For now, let's assume we can get it from the file extension or store it.
            // I'll update the Document model to store mimetype if needed, but let's just guess for now or pass it.
            // Actually, let's just use the extension.
            const ext = doc.filename.split('.').pop().toLowerCase();
            let mimeType = 'text/plain';
            if (ext === 'pdf') mimeType = 'application/pdf';
            if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            if (ext === 'csv') mimeType = 'text/csv';

            text = await extractTextFromFile(doc.s3Key, mimeType);
        } else {
            text = await extractTextFromUrl(doc.s3Url);
        }

        const chunks = await splitText(text);
        // Pass API key to generateEmbeddings
        const embeddings = await generateEmbeddings(chunks, 'RETRIEVAL_DOCUMENT', geminiApiKey);

        const vectors = chunks.map((chunk, i) => ({
            id: `${doc._id}_${i}`,
            values: embeddings[i],
            metadata: {
                text: chunk,
                docId: doc._id.toString(),
                orgId: orgId,
                filename: doc.type === 'file' ? doc.filename : null,
                url: doc.s3Url, // This will be S3 URL for files, or original URL for scraped pages
                type: doc.type, // 'file' or 'url'
                source: doc.filename || doc.s3Url
            }
        }));

        await upsertVectors(vectors, orgId);

        doc.status = 'indexed';
        doc.chunkCount = chunks.length;
        await doc.save();
    } catch (error) {
        console.error('Error processing document:', error);
        doc.status = 'failed';
        await doc.save();
    }
};

const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { key, url } = await uploadFileToS3(req.file, req.user.orgId);

        // Clean up local file after upload
        fs.unlinkSync(req.file.path);

        const doc = await Document.create({
            orgId: req.user.orgId,
            filename: req.file.originalname,
            originalName: req.file.originalname,
            s3Key: key,
            s3Url: url,
            type: 'file',
            status: 'pending'
        });

        // Trigger processing asynchronously with org's API key
        const geminiApiKey = req.user.geminiApiKey || process.env.GEMINI_API_KEY;
        processDocument(doc, req.user.orgId, geminiApiKey);

        res.status(201).json(doc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const uploadUrl = async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ message: 'URL is required' });
    }

    try {
        const doc = await Document.create({
            orgId: req.user.orgId,
            filename: url,
            s3Url: url,
            type: 'url',
            status: 'pending'
        });

        // Trigger processing asynchronously with org's API key
        const geminiApiKey = req.user.geminiApiKey || process.env.GEMINI_API_KEY;
        processDocument(doc, req.user.orgId, geminiApiKey);

        res.status(201).json(doc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getDocuments = async (req, res) => {
    try {
        const docs = await Document.find({ orgId: req.user.orgId }).sort({ createdAt: -1 });
        res.json(docs);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const doc = await Document.findOne({ _id: req.params.id, orgId: req.user.orgId });

        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        if (doc.type === 'file') {
            await deleteFileFromS3(doc.s3Key);
        }

        // Delete vectors
        // We need to know the IDs. Since we didn't store them explicitly in DB, we can't easily delete by ID unless we query first or store chunk count.
        // We stored chunkCount. IDs are docId_0, docId_1...
        const vectorIds = Array.from({ length: doc.chunkCount }, (_, i) => `${doc._id}_${i}`);
        if (vectorIds.length > 0) {
            await deleteVectors(vectorIds, req.user.orgId);
        }

        await doc.deleteOne();

        res.json({ message: 'Document removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { uploadFile, uploadUrl, getDocuments, deleteDocument };
