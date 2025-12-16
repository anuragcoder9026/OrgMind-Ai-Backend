const { GoogleGenerativeAI } = require('@google/generative-ai');
// const { EMBEDDING_MODEL } = require('../../shared/constants');

const EMBEDDING_MODEL = "text-embedding-004";

const generateEmbeddings = async (texts, taskType = 'RETRIEVAL_DOCUMENT', apiKey = null) => {
    // Use provided API key or fall back to environment variable
    const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        throw new Error('Gemini API key is required for generating embeddings');
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

    if (texts.length === 0) return [];

    const BATCH_SIZE = 100;
    const allEmbeddings = [];

    // Chunk the texts into batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batchTexts = texts.slice(i, i + BATCH_SIZE);

        const requests = batchTexts.map(t => ({
            content: { parts: [{ text: t }] },
            taskType: taskType
        }));

        try {
            const result = await model.batchEmbedContents({
                requests
            });
            const batchEmbeddings = result.embeddings.map(e => e.values);
            allEmbeddings.push(...batchEmbeddings);
        } catch (error) {
            console.error(`Error embedding batch ${i / BATCH_SIZE}:`, error);
            throw error;
        }
    }

    return allEmbeddings;
};

module.exports = { generateEmbeddings };
