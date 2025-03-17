const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Set up log file path
const logFilePath = path.join(__dirname, 'script.log');

// Function to write logs to file
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage, 'utf8');
}

// Database connection configuration
const config = {
  user: 'qbc_user',
  password: 'qbc_user',
  server: '10.45.35.197',
  database: 'QBCollection_Plus_UAT',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Extract command-line arguments
const args = process.argv.slice(2);
let templateName = null;
let htmlBody = null;

args.forEach((arg, index) => {
  if (arg.startsWith('--template')) {
    templateName = args[index + 1]?.trim(); // Trim whitespace
  } else if (arg.startsWith('--htmlBody')) {
    htmlBody = args[index + 1]; // Keep original, since HTML might need spaces
  }
});

// Validate input
if (!templateName || !htmlBody) {
  console.error('❌ Please provide both --template <TemplateName> and --htmlBody <HTMLContent>');
  logToFile('❌ Error: Missing required arguments --template or --htmlBody');
  process.exit(1);
}

// Function to update the template body
async function updateOBMessageTemplateBody(templateName, htmlBody) {
  try {
    let pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');
    console.log(`✅ Connected to SQL Server: Values are ${templateName} ${htmlBody}`); logToFile('✅ Connected to SQL Server');

    // Fetch the template ID
    const idResult = await pool
      .request()
      .input('templateName', sql.VarChar, templateName)
      .query('SELECT TOP 1 id FROM OBMessageTemplate WHERE TemplateName = @templateName');

    if (idResult.recordset.length === 0) {
      console.log('⚠️ No matching template found.');
      logToFile(`⚠️ No matching template found for TemplateName: ${templateName}`);
      sql.close();
      return;
    }

    const templateId = idResult.recordset[0].id;
    console.log(`📌 Template ID found: ${templateId}`);
    logToFile(`📌 Template ID found: ${templateId}`);

    // Update the template body
    const updateResult = await pool
      .request()
      .input('templateId', sql.Int, templateId)
      .input('htmlBody', sql.NVarChar, htmlBody) // Use NVarChar to store Unicode HTML content
      .query('UPDATE OBMessageTemplate SET Body = @htmlBody WHERE Id = @templateId');

    console.log(`✅ Template updated successfully. Rows affected: ${updateResult.rowsAffected[0]}`);
    logToFile(`✅ Template updated successfully. Rows affected: ${updateResult.rowsAffected[0]}`);

    sql.close(); // Close connection
  } catch (err) {
    console.error('❌ Database operation failed:', err);
    logToFile(`❌ Database operation failed: ${err.message}`);
  }
}

// Run the update function
updateOBMessageTemplateBody(templateName, htmlBody);
