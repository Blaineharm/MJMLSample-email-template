const fs = require('fs');
const path = require('path');
const mjml = require('mjml');
const sql = require('mssql');
const configSetting = require('./config');

// Set up log file path
const logDir = path.resolve(__dirname, './logs');
const logFile = path.join(logDir, 'updateOBMessageTemplatesPerStream_script.log');

// Function to write logs to file
function logToFile(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  // Write to file
  fs.appendFileSync(logFile, logEntry, 'utf8');

  // Also log to console
  isError ? console.error(logEntry) : console.log(logEntry);
}

// SQL Server connection config
const config = {
  user: configSetting.USER,
  password: configSetting.PASSWORD,
  server: configSetting.UAT_SERVER,
  database: configSetting.UAT_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
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

// Validate input
if (!streamName || !streamNumber) {
  console.error('❌ Please provide both --stream <StreamName> and --streamNumber <StreamNumber>');
  logToFile('❌ Error: Missing required arguments --stream or --streamNumber');
  process.exit(1);
}

// Function to find the MJML template file
function findTemplateFile(dir, templateName) {
  const filePath = path.join(dir, templateName);
  if (fs.existsSync(filePath)) {
    return filePath; // Return path if file exists
  }

  return null; // Return null if file not found
}

// Function to update the template body in the database
async function updateOBMessageTemplateBody(templateId, htmlBody) {
  let pool;
  try {
    pool = await sql.connect(config);

    console.log('✅ Connected to SQL Server');
    logToFile('✅ Connected to SQL Server');

    // Update the template body in the OBMessageTemplate Table using the converted MJML to HTML
    const updateResult = await pool
      .request()
      .input('templateId', sql.Int, templateId)
      .input('htmlBody', sql.NVarChar, htmlBody) // Use NVarChar to store Unicode HTML content
      .query('UPDATE OBMessageTemplate SET Body = @htmlBody WHERE Id = @templateId');

    console.log(`✅ Template updated successfully. Rows affected: ${updateResult.rowsAffected[0]}`);
    logToFile(`✅ Template updated successfully. Rows affected: ${updateResult.rowsAffected[0]}`);
  } catch (err) {
    console.error('❌ Database operation failed:', err);
    logToFile(`❌ Database operation failed: ${err.message}`);
  } finally {
    if (pool) {
      pool.close(); // Ensure the connection is closed even if an error occurs
    }
  }
}

// Main function to read and process the MJML file
async function processTemplate() {
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');
    logToFile('✅ Connected to SQL Server');

    // Fetch the stream ID from the OBSTREAM Table
    const streamResult = await pool
      .request()
      .input('streamName', sql.VarChar, streamName)
      .input('streamNumber', sql.Int, streamNumber)
      .query('SELECT id FROM OBSTREAM WHERE StreamName = @streamName AND StreamNumber = @streamNumber');

    if (streamResult.recordset.length === 0) {
      console.log('⚠️ No matching stream found.');
      logToFile(`⚠️ No matching stream found for StreamName: ${streamName} and StreamNumber: ${streamNumber}`);
      return;
    }

    const streamId = streamResult.recordset[0].id;
    console.log(`📌 Stream ID found: ${streamId}`);
    logToFile(`📌 Stream ID found: ${streamId}`);

    // Fetch the template IDs from the OBMessageTemplate Table based on the StreamId
    const templateResult = await pool
      .request()
      .input('streamId', sql.Int, streamId)
      .query("SELECT id, TemplateName FROM OBMessageTemplate WHERE Streamid = @streamId AND TemplateType = 'Email' AND IsActive = 1");

    if (templateResult.recordset.length === 0) {
      console.log('⚠️ No templates found for this stream ID.');
      logToFile(`⚠️ No templates found for StreamId: ${streamId}`);
      return;
    }

    // Process each template
    for (const template of templateResult.recordset) {
      const templateId = template.id;
      console.log(`📌 Processing Template: ${template.TemplateName} with ID: ${templateId}`);

      const streamsDir = path.resolve(__dirname, `./src/streams/${streamName}`);
      const mjmlTemplatePath = findTemplateFile(streamsDir, template.TemplateName + '.mjml');

      if (!mjmlTemplatePath) {
        console.log(`❌ Template '${template.TemplateName}' not found in src/streams`);
        logToFile(`❌ Template '${template.TemplateName}' not found in src/streams`);
        continue;
      }

      logToFile(`📄 Template found: ${mjmlTemplatePath}`);

      // Read the MJML template file using fs.promises.readFile for async support
      const mjmlContent = await fs.promises.readFile(mjmlTemplatePath, 'utf8');

      // Resolve includes
      let processedMjml = resolveIncludes(mjmlContent, path.dirname(mjmlTemplatePath));

      // Convert MJML to HTML
      const { html, errors } = mjml(processedMjml);

      if (errors.length > 0) {
        console.log(`❌ MJML Conversion Errors: ${JSON.stringify(errors, null, 2)}`);
        logToFile(`❌ MJML Conversion Errors: ${JSON.stringify(errors, null, 2)}`);
        continue;
      }

      console.log('✅ MJML conversion successful');
      logToFile('✅ MJML conversion successful');

      // Call the function to update the template body in the database
      await updateOBMessageTemplateBody(templateId, html);
    }
  } catch (err) {
    console.log(`❌ Error processing stream and templates: ${err.message}`);
    logToFile(`❌ Error processing stream and templates: ${err.message}`);
  }
}

function resolveIncludes(content, basePath) {
  return content.replace(/<mj-include path="(.*?)"\s*\/>/g, (match, includePath) => {
    const includeFilePath = path.resolve(basePath, includePath);
    if (fs.existsSync(includeFilePath)) {
      logToFile(`✅ Included file: ${includeFilePath}`);
      return fs.readFileSync(includeFilePath, 'utf8');
    } else {
      logToFile(`❌ Error: Included file not found - ${includeFilePath}`);
      return `<!-- Failed to include: ${includeFilePath} -->`;
    }
  });
}

// Run the script
processTemplate();
