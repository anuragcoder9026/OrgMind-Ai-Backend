const { Pinecone } = require('@pinecone-database/pinecone');

let pineconeClient;

const initPinecone = async () => {
    if (!pineconeClient) {
        pineconeClient = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
            // environment is no longer required in v3+ for most cases or is auto-detected
        });
    }
    return pineconeClient;
};

const upsertVectors = async (vectors, namespace) => {
    const client = await initPinecone();
    // In v3, we get the index object directly
    const index = client.index(process.env.PINECONE_INDEX);

    // Batch size to avoid exceeding Pinecone's 2MB request limit
    const BATCH_SIZE = 100;

    // Process vectors in batches
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
        const batch = vectors.slice(i, i + BATCH_SIZE);
        await index.namespace(namespace).upsert(batch);
        console.log(`Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vectors.length / BATCH_SIZE)} (${batch.length} vectors)`);
    }
};

const queryVectors = async (vector, namespace, topK = 10) => {
    const client = await initPinecone();
    const index = client.index(process.env.PINECONE_INDEX);

    const queryResponse = await index.namespace(namespace).query({
        vector,
        topK,
        includeMetadata: true,
        includeValues: true
    });

    return queryResponse.matches;
};

const deleteVectors = async (ids, namespace) => {
    try {
        const client = await initPinecone();
        const index = client.index(process.env.PINECONE_INDEX);
        await index.namespace(namespace).deleteMany(ids);
    } catch (error) {
        // If 404, it means vectors/index/namespace not found, which is fine for cleanup
        if (error.message && error.message.includes('404')) {
            console.warn('Vector delete 404 (ignored):', error.message);
            return;
        }
        throw error;
    }
};

const saveFeedbackToPinecone = async (question, answer, orgId, apiKey) => {
    const { generateEmbeddings } = require('./embeddings');

    // Generate embedding for the question - generateEmbeddings expects (texts array, taskType, apiKey)
    const embeddings = await generateEmbeddings([question], 'RETRIEVAL_DOCUMENT', apiKey);
    const embedding = embeddings[0]; // Get the first (and only) embedding

    // Create unique ID for this feedback
    const feedbackId = `feedback_${orgId}_${Date.now()}`;

    // Create vector with metadata
    const vector = {
        id: feedbackId,
        values: embedding,
        metadata: {
            type: 'feedback',
            question: question,
            answer: answer,
            orgId: orgId,
            text: `Q: ${question}\nA: ${answer}`, // Combined for better retrieval
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        }
    };

    // Upsert to Pinecone in the organization's namespace
    await upsertVectors([vector], orgId);

    return { success: true, id: feedbackId };
};

module.exports = { upsertVectors, queryVectors, deleteVectors, saveFeedbackToPinecone };
