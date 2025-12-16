const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

const splitText = async (text) => {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
    });

    const output = await splitter.createDocuments([text]);
    return output.map(doc => doc.pageContent);
};

module.exports = { splitText };
