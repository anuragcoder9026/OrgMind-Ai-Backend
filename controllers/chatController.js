const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateEmbeddings } = require('../rag/embeddings');
const { queryVectors } = require('../rag/vectorStore');
const ChatLog = require('../models/ChatLog');
const Document = require('../models/Document');

const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant . You are NOT a Google Gemini AI.  Use the provided context to answer the user's question. If the answer is not available in the context, politely state that you do not have that information in your knowledge base.";

const chat = async (req, res) => {
    const { message, history } = req.body;
    const org = req.org;

    if (!message) {
        return res.status(400).json({ message: 'Message is required' });
    }

    try {
        // Use organization's Gemini API key if set, otherwise fall back to environment variable
        const geminiApiKey = org.geminiApiKey || process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            return res.status(500).json({ message: 'Gemini API key not configured. Please set your API key in Settings.' });
        }

        // Create GoogleGenerativeAI instance with the appropriate API key
        const genAI = new GoogleGenerativeAI(geminiApiKey);

        // 1. Embed query (using RETRIEVAL_QUERY task type for better relevance)
        // Note: generateEmbeddings expects array and now accepts API key parameter
        const [embedding] = await generateEmbeddings([message], 'RETRIEVAL_QUERY', geminiApiKey);

        // 2. Query Pinecone
        const matches = await queryVectors(embedding, org.orgId);
        const context = matches.map(match => match.metadata.text).join('\n\n');

        // 3. Construct Prompt
        const systemPrompt = (org.settings.systemInstructions || DEFAULT_SYSTEM_PROMPT).replace('{{orgName}}', org.name);

        // Gemini Chat Session
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        // Construct history for Gemini
        // Gemini expects history as [{ role: 'user' | 'model', parts: [{ text: '...' }] }]
        // Our history from frontend is [{ role: 'user' | 'assistant', content: '...' }]
        let chatHistory = (history || []).map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }]
        }));

        // Gemini restriction: History must start with 'user' role
        while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
            chatHistory.shift();
        }

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
            },
        });

        // Final prompt with context
        const finalMessage = `${systemPrompt}\n\nContext:\n${context}\n\nUser: ${message}`;

        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        try {
            const result = await chat.sendMessageStream(finalMessage);

            let fullResponse = ''; // Initialize fullResponse here

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) { // Only append if chunkText is not empty
                    fullResponse += chunkText;
                    res.write(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
                }
            }

            // Send sources/retrieved chunks before [DONE]
            // Group chunks by source to show unique documents
            const sourceMap = new Map();
            const docIds = new Set();

            matches.forEach(match => {
                const sourceKey = match.metadata.source || match.metadata.filename || match.metadata.url || 'Unknown Source';

                // Collect docIds for documents that don't have URL in metadata
                if (match.metadata.docId && !match.metadata.url) {
                    docIds.add(match.metadata.docId);
                }

                if (!sourceMap.has(sourceKey)) {
                    sourceMap.set(sourceKey, {
                        filename: match.metadata.filename || match.metadata.source || 'Customized Response',
                        url: match.metadata.url,
                        type: match.metadata.type,
                        source: sourceKey,
                        docId: match.metadata.docId,
                        chunkCount: 0,
                        maxScore: match.score || 0
                    });
                }

                const existing = sourceMap.get(sourceKey);
                existing.chunkCount++;
                existing.maxScore = Math.max(existing.maxScore, match.score || 0);
            });

            // Fetch URLs from MongoDB for documents that don't have it in metadata
            if (docIds.size > 0) {
                try {
                    const docs = await Document.find({ _id: { $in: Array.from(docIds) } }).select('_id s3Url type').lean();
                    const docMap = new Map(docs.map(doc => [doc._id.toString(), doc]));

                    // Update sources with URLs from MongoDB
                    sourceMap.forEach((source, key) => {
                        if (source.docId && !source.url) {
                            const doc = docMap.get(source.docId);
                            if (doc) {
                                source.url = doc.s3Url;
                                source.type = doc.type;
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error fetching document URLs:', error);
                }
            }

            const sources = Array.from(sourceMap.values());
            console.log('📤 Sending sources to frontend:', sources.length, 'unique sources from', matches.length, 'chunks');
            res.write(`data: ${JSON.stringify({ sources })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();

            // Log chat to database (no await to not block response)
            ChatLog.create({
                orgId: org.orgId,
                userQuestion: message, // Changed from 'message' to 'userQuestion' for consistency
                botResponse: fullResponse, // Use the collected fullResponse
                retrievedChunks: matches.map(m => m.metadata) // Added retrievedChunks back
            }).catch(err => console.error('Error saving chat log:', err));

        } catch (streamError) {
            console.error('Streaming error:', streamError);

            // Extract meaningful error message
            let errorMessage = 'An error occurred while processing your request';
            let statusText = streamError.statusText || streamError.message || 'Internal Server Error';

            if (streamError.message) {
                errorMessage = streamError.message;
            }

            // Send error as SSE event
            res.write(`data: ${JSON.stringify({
                error: true,
                message: errorMessage,
                statusText: statusText
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (error) {
        console.error('Chat error:', error);

        // Extract error details
        let errorMessage = error.message || 'Failed to process chat request';
        let statusText = error.statusText || error.message || 'Internal Server Error';

        // If it's not a streaming response yet, send JSON error
        if (!res.headersSent) {
            return res.status(500).json({
                message: errorMessage,
                statusText: statusText,
                error: true
            });
        }
    }
};

const getChatLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, dateFilter = 'all' } = req.query;
        const orgId = req.org.orgId;

        // Build date filter
        let dateQuery = {};
        const now = new Date();

        switch (dateFilter) {
            case 'today':
                const startOfToday = new Date(now.setHours(0, 0, 0, 0));
                dateQuery = { timestamp: { $gte: startOfToday } };
                break;
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateQuery = { timestamp: { $gte: weekAgo } };
                break;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                dateQuery = { timestamp: { $gte: monthAgo } };
                break;
            default:
                dateQuery = {};
        }

        // Build query
        const query = { orgId, ...dateQuery };

        // Get total count for pagination
        const total = await ChatLog.countDocuments(query);

        // Calculate pagination
        const skip = (page - 1) * limit;
        const totalPages = Math.ceil(total / limit);

        // Fetch logs with pagination and sorting
        const logs = await ChatLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('userQuestion botResponse timestamp createdAt')
            .lean();

        res.json({
            logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages
            }
        });
    } catch (error) {
        console.error('Error fetching chat logs:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const saveFeedback = async (req, res) => {
    try {
        const { questionId, userQuestion, correctResponse } = req.body;
        const orgId = req.org.orgId;
        const geminiApiKey = req.org.geminiApiKey || process.env.GEMINI_API_KEY;

        // Validate inputs
        if (!userQuestion || !correctResponse) {
            return res.status(400).json({ message: 'Question and correct response are required' });
        }

        // Import the vectorStore function
        const { saveFeedbackToPinecone } = require('../rag/vectorStore');

        // Save feedback to Pinecone
        const result = await saveFeedbackToPinecone(
            userQuestion,
            correctResponse,
            orgId,
            geminiApiKey
        );

        console.log('Feedback saved to Pinecone:', result);

        res.json({
            success: true,
            message: 'Correct response saved successfully',
            feedbackId: result.id
        });
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({
            message: 'Failed to save feedback',
            error: error.message
        });
    }
};

module.exports = { chat, getChatLogs, saveFeedback };
