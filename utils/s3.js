const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'documents';

const uploadFileToS3 = async (file, orgId) => {
    try {
        const fileContent = fs.readFileSync(file.path);
        const timestamp = Date.now();
        const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const key = `${orgId}/${timestamp}-${cleanFileName}`;

        // Check if bucket exists, if not try to create it (requires permissions)
        // Note: The anon key usually doesn't have permissions to create buckets. 
        // We will catch the specific error and give a helpful message.

        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(key, fileContent, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            if (error.statusCode === '404' && error.message.includes('Bucket not found')) {
                throw new Error(`Bucket '${BUCKET_NAME}' not found. Please create it in your Supabase dashboard.`);
            }
            throw error;
        }

        // Get public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(key);

        return {
            key: key,
            url: publicUrlData.publicUrl
        };
    } catch (error) {
        console.error('Supabase Upload Error:', error);
        throw new Error('Failed to upload file to storage');
    }
};

const getFileFromS3 = async (key) => {
    try {
        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .download(key);

        if (error) {
            throw error;
        }

        // data is a Blob in browser, but in Node it might be ArrayBuffer. 
        // We need to convert it to something readable for our extractors.
        // The sdk returns a Blob. We can stream it.
        return data.stream();
    } catch (error) {
        console.error('Supabase Download Error:', error);
        throw new Error('Failed to download file from storage');
    }
};

const deleteFileFromS3 = async (key) => {
    try {
        const { error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .remove([key]);

        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('Supabase Delete Error:', error);
        // We might not want to throw here to not break the deletion flow if file is missing
    }
};

module.exports = { uploadFileToS3, getFileFromS3, deleteFileFromS3 };
