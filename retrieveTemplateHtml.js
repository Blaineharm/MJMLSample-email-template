const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const configSetting = require('./config');

// Set up log file path
const logDir = path.resolve(__dirname, './logs');
const logFile = path.join(logDir, 'retrieveTemplateHtml_script.log');

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

// Function to fetch the template body from the database
async function fetchTemplateBody(templateName) {
  let pool;
  try {
    pool = await sql.connect(config);

    console.log('✅ Connected to SQL Server');
    logToFile('✅ Connected to SQL Server');

    // Fetch the template body from the OBMessageTemplate table
    const result = await pool
      .request()
      .input('templateName', sql.VarChar, templateName)
      .query('SELECT TOP 1 Body FROM OBMessageTemplate WHERE TemplateName = @templateName');

    if (result.recordset.length === 0) {
      console.log('⚠️ No matching template found.');
      logToFile(`⚠️ No matching template found for TemplateName: ${templateName}`);
      return null;
    }

    const body = result.recordset[0].Body;
    console.log(`📌 Template Body fetched successfully.`);
    logToFile(`📌 Template Body fetched successfully.`);

    return body;

  } catch (err) {
    console.error('❌ Database operation failed:', err);
    logToFile(`❌ Database operation failed: ${err.message}`);
    return null;
  } finally {
    if (pool) {
      pool.close(); // Ensure the connection is closed even if an error occurs
    }
  }
}

// Function to save the HTML body to a file
function saveBodyToFile(htmlBody) {

  const outputPath = path.join('C:', 'temp', `${templateName}.html`);

  try {
    fs.writeFileSync(outputPath, htmlBody, 'utf8');
    console.log(`✅ HTML Body saved to ${outputPath}`);
    logToFile(`✅ HTML Body saved to ${outputPath}`);
  } catch (err) {
    console.error('❌ Error saving the file:', err);
    logToFile(`❌ Error saving the file: ${err.message}`);
  }
}

// Main function to process the template and save the body as HTML
async function processTemplate() {

  const htmlBody = await fetchTemplateBody(templateName);
  if (htmlBody) {
    saveBodyToFile(htmlBody); // Save the body to the file
  }
}

// Run the script
processTemplate();
