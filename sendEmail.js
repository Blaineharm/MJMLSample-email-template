const fs = require('fs');
const path = require('path');
const mjml = require('mjml');
const Mailjet = require('node-mailjet');
//require('dotenv').config(); // Load environment variables from .env file for api key
//mailjet or sendgrid TODO: make it work =P

// Read command line arguments for placeholders and template
const args = process.argv.slice(2);
const placeholders = {};
let templateName = 'defaultTemplate.mjml';

args.forEach((arg, index) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[index + 1];
    if (key === 'template' && value) {
      templateName = value; // Set the template name if specified
    } else if (value && !value.startsWith('--')) {
      placeholders[`{{${key}}}`] = value;
    }
  }
});

// Function to find the template file in any subfolder of streams
function findTemplateFile(baseDir, fileName) {
  let files = fs.readdirSync(baseDir, { withFileTypes: true });
  for (let file of files) {
    let fullPath = path.join(baseDir, file.name);
    if (file.isDirectory()) {
      let found = findTemplateFile(fullPath, fileName);
      if (found) return found;
    } else if (file.name === fileName) {
      return fullPath;
    }
  }
  return null;
}

const streamsDir = path.resolve(__dirname, './src/streams');
const mjmlTemplatePath = findTemplateFile(streamsDir, templateName);

if (!mjmlTemplatePath) {
  console.error(`Error: Template file '${templateName}' not found in src/streams folder.`);
  process.exit(1);
}

// Function to resolve and replace <mj-include>
function resolveIncludes(content, basePath) {
  return content.replace(/<mj-include path="(.*?)"\s*\/>/g, (match, includePath) => {
    const includeFilePath = path.resolve(basePath, includePath);
    if (fs.existsSync(includeFilePath)) {
      return fs.readFileSync(includeFilePath, 'utf8');
    } else {
      console.error(`Error: Included file not found - ${includeFilePath}`);
      return `<!-- Failed to include: ${includeFilePath} -->`;
    }
  });
}

// Read and process the MJML file
fs.readFile(mjmlTemplatePath, 'utf8', (err, mjmlContent) => {
  if (err) {
    console.error('Error reading MJML file:', err);
    return;
  }

  // Resolve all includes before processing MJML
  let processedMjml = resolveIncludes(mjmlContent, path.dirname(mjmlTemplatePath));

  // Replace placeholders dynamically in the processed MJML
  Object.keys(placeholders).forEach((key) => {
    processedMjml = processedMjml.replace(new RegExp(key, 'g'), placeholders[key]);
  });

  // Convert MJML to HTML
  const { html, errors } = mjml(processedMjml);

  if (errors.length > 0) {
    console.error('MJML Conversion Errors:', errors);
    return;
  }

  console.log('Generated HTML:\n', html);

  // Send the email using Mailjet API
  const mailjet = Mailjet.apiConnect(
    config.SENDMAILJET_APIKEY,
    config.SENDMAILJET_SECRETKEY
  );

  const request = mailjet
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: { Email: 'bharmsen@qualco.co.uk', Name: 'Test Email' },
          To: [{ Email: 'bharmsen@qualco.co.uk', Name: 'Test Email' }],
          Subject: 'Test email subject',
          TextPart: 'Test Email text part',
          HTMLPart: html,
        },
      ],
    });

  // Handle request response
  request
    .then((result) => console.log('Email sent successfully:', result.body))
    .catch((err) => console.error('Error sending email:', err.statusCode));
});