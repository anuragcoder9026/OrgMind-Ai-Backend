const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const cheerio = require('cheerio');
const { getFileFromS3 } = require('../utils/s3');

const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

const extractTextFromFile = async (fileKey, mimeType) => {
    const stream = await getFileFromS3(fileKey);
    const buffer = await streamToBuffer(stream);

    let text = '';

    if (mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        text = data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv') {
        text = buffer.toString('utf-8');
    } else {
        throw new Error('Unsupported file type');
    }

    return text;
};

const https = require('https');

const extractTextFromUrl = async (url) => {
    try {
        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        const { data } = await axios.get(url, {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: 30000 // 30 seconds
        });
        const $ = cheerio.load(data);

        // Remove scripts, styles, and other non-content elements
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('footer').remove();
        $('header').remove();

        const text = $('body').text().replace(/\s+/g, ' ').trim();
        return text;
    } catch (error) {
        console.error('Error scraping URL:', error);
        throw new Error('Failed to scrape URL');
    }
};

module.exports = { extractTextFromFile, extractTextFromUrl };
