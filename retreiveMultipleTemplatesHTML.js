const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const configSetting = require('./config');

// Set up log file path
const logDir = path.resolve(__dirname, './logs');
const logFile = path.join(logDir, 'retrieveMultipleTemplateHtml_script.log');

function logToFile(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry, 'utf8');
    isError ? console.error(logEntry) : console.log(logEntry);
}

const config = {
    user: configSetting.USER,
    password: configSetting.PASSWORD,
    server: configSetting.UAT_SERVER,
    database: configSetting.UAT_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};

// Read command-line arguments
const args = process.argv.slice(2);
const argMap = {}; // Object to store argument key-value pairs

args.forEach((arg, index) => {
    if (arg.startsWith('--')) {
        const key = arg.slice(2); // Remove "--"
        const value = args[index + 1];

        // Store only valid values (ignoring the next item if it's another argument)
        if (value && !value.startsWith('--')) {
            argMap[key] = value.trim();
        }
    }
});

// Extract stream name and number
const streamName = argMap['stream'] || null;
const streamNumber = argMap['streamNumber'] ? parseInt(argMap['streamNumber'], 10) : null;

console.log(`Passed arguments -> Stream: ${streamName}, StreamNumber: ${streamNumber}`);

// Validate required arguments
if (!streamName || isNaN(streamNumber)) {
    console.error('❌ Please provide --stream <StreamName> and --streamNumber <StreamNumber>');
    logToFile('❌ Error: Missing required arguments --stream and/or --streamNumber');
    process.exit(1);
}

logToFile(`📌 Processing Stream: ${streamName}, StreamNumber: ${streamNumber}`);

async function fetchStreamId(streamName, streamNumber) {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log(`Inside fetchStreamId -> Stream: ${streamName}, StreamNumber: ${streamNumber}`);

        const result = await pool.request()
            .input('streamName', sql.VarChar, streamName)
            .input('streamNumber', sql.Int, streamNumber)
            .query(`SELECT TOP 1 Id FROM OBStream WHERE StreamName = @streamName AND StreamNumber = @streamNumber`);

        if (result.recordset.length === 0) {
            logToFile(`⚠️ No matching stream found for: ${streamName} (StreamNumber: ${streamNumber})`);
            return null;
        }
        return result.recordset[0].Id;
    } catch (err) {
        logToFile(`❌ Error fetching StreamId: ${err.message}`, true);
        return null;
    } finally {
        if (pool) pool.close();
    }
}

async function fetchTemplates(streamId) {
    let pool;
    try {
        pool = await sql.connect(config);
        const result = await pool.request()
            .input('streamId', sql.Int, streamId)
            .query(`SELECT TemplateName,Body FROM OBMessageTemplate WHERE StreamId = @streamId AND IsActive = 1 AND TemplateType = 'Email' AND Body IS NOT NULL AND Body != ''`);
        return result.recordset;
    } catch (err) {
        logToFile(`❌ Error fetching templates: ${err.message}`, true);
        return [];
    } finally {
        if (pool) pool.close();
    }
}

function sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_'); // Replace invalid characters
}

function saveTemplatesToFile(templates) {
    const baseDir = 'C:/temp';
    const sanitizedStreamName = sanitizeFileName(streamName);
    const outputDir = path.join(baseDir, sanitizedStreamName);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    templates.forEach((template) => {
        const sanitizedTemplateName = sanitizeFileName(template.TemplateName);
        const filePath = path.join(outputDir, `${sanitizedTemplateName}.html`); // Use TemplateName as filename
        try {
            fs.writeFileSync(filePath, template.Body, 'utf8');
            logToFile(`✅ Saved template to ${filePath}`);
        } catch (err) {
            logToFile(`❌ Error saving file ${filePath}: ${err.message}`, true);
        }
    });
}

async function processTemplates() {
    const streamId = await fetchStreamId(streamName, streamNumber);
    if (!streamId) {
        console.error('❌ Stream ID not found. Exiting.');
        process.exit(1);
    }
    const templates = await fetchTemplates(streamId);
    if (templates.length > 0) {
        saveTemplatesToFile(templates);
    } else {
        console.log('⚠️ No templates found.');
        logToFile('⚠️ No templates found for the given StreamId.');
    }
}

processTemplates();
