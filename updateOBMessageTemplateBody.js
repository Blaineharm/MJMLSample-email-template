const fs = require('fs');
const path = require('path');
const mjml = require('mjml');
const sql = require('mssql');
const configSetting = require('./config');


// Set up log file path
const logDir = path.resolve(__dirname, './logs');
const logFile = path.join(logDir, 'updateOBMessageTemplateBody_script.log');

// Function to write logs to file
function logToFile(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  // Write to file
  fs.appendFileSync(logFile, logEntry, 'utf8');

  // Also log to console
  isError ? console.error(logEntry) : console.log(logEntry);
}

function logMessage(message, isError = false) {
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

// Read command line arguments
const args = process.argv.slice(2);
let templateName = null;

args.forEach((arg, index) => {
  if (arg.startsWith('--template')) {
    templateName = args[index + 1]?.trim(); // Trim whitespace
  }
});

// Validate input
if (!templateName) {
  console.error('❌ Please provide --template <TemplateName>');
  logToFile('❌ Error: Missing required argument --template');
  process.exit(1);
}

// Function to find the .mjml template file in the src stream subfolders
function findTemplateFile(baseDir, fileName) {
  let files = fs.readdirSync(baseDir, { withFileTypes: true });
  for (let file of files) {
    let fullPath = path.join(baseDir, file.name);
    if (file.isDirectory()) {
      let found = findTemplateFile(fullPath, fileName);
      if (found) return found;
    } else if (file.name === fileName && file.name.endsWith('.mjml')) {
      return fullPath; // Only return files with the .mjml extension
    }
  }
  return null;
}

// Function to resolve <mj-include> paths in MJML content (For the shared components i.e header and footer)
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

// Function to update the template body in the database
async function updateOBMessageTemplateBody(templateName, htmlBody) {
  let pool;
  try {
    pool = await sql.connect(config);

    console.log('✅ Connected to SQL Server');
    logToFile('✅ Connected to SQL Server');

    console.log(`Template Name in updateOBMessageTemplateBody '${templateName}'`);

    // Fetch the template ID from the OBMessageTemplate Table
    const idResult = await pool
      .request()
      .input('templateName', sql.VarChar, templateName)
      .query('SELECT TOP 1 id FROM OBMessageTemplate WHERE TemplateName = @templateName');

    if (idResult.recordset.length === 0) {
      console.log('⚠️ No matching template found.');
      logToFile(`⚠️ No matching template found for TemplateName: ${templateName}`);
      return;
    }

    const templateId = idResult.recordset[0].id;
    console.log(`📌 Template ID found: ${templateId}`);
    logToFile(`📌 Template ID found: ${templateId}`);

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
  const streamsDir = path.resolve(__dirname, './src/streams');
  const mjmlTemplatePath = findTemplateFile(streamsDir, templateName + '.mjml'); // Ensure the file name ends with .mjml

  if (!mjmlTemplatePath) {
    console.log(`❌ Template '${templateName}' not found in src/streams`);
    logToFile(`❌ Template '${templateName}' not found in src/streams`);
    process.exit(1);
  }

  logToFile(`📄 Template found: ${mjmlTemplatePath}`);

  try {
    // Read the MJML template file using fs.promises.readFile for async support
    const mjmlContent = await fs.promises.readFile(mjmlTemplatePath, 'utf8');

    // Resolve includes
    let processedMjml = resolveIncludes(mjmlContent, path.dirname(mjmlTemplatePath));

    // Convert MJML to HTML
    const { html, errors } = mjml(processedMjml);

    if (errors.length > 0) {
      console.log(`❌ MJML Conversion Errors: ${JSON.stringify(errors, null, 2)}`);
      logToFile(`❌ MJML Conversion Errors: ${JSON.stringify(errors, null, 2)}`);
      return;
    }

    console.log('✅ MJML conversion successful');
    logToFile('✅ MJML conversion successful');

    // Call the function to update the template in the database
    await updateOBMessageTemplateBody(templateName, html);
  } catch (err) {
    console.log(`❌ Error reading MJML file: ${err.message}`);
    logToFile(`❌ Error reading MJML file: ${err.message}`);
  }
}

// Run the script
processTemplate();
