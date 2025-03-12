const fs = require('fs');
const path = require('path');
const mjml = require('mjml');
const Mailjet = require('node-mailjet');


const mailjet = Mailjet.apiConnect(
  '3e14a321932092bef164b8e368bf2c59',
  'd7f2640fdc0c0af2d4fcbe12243f7341'
);

// Define the path to the MJML template
const mjmlTemplatePath = path.resolve(__dirname, './src/templates/index.mjml');

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

  // Define placeholders
  const placeholders = {
    '{{name}}': 'John Doe',
    '{{order_id}}': '12345'
  };

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

  // Send the email using Mailjet API
  const request = mailjet
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: 'bharmsen@qualco.co.uk',
            Name: 'Test Email'
          },
          To: [
            {
              Email: 'bharmsen@qualco.co.uk',
              Name: 'Test Email'
            }
          ],
          Subject: 'Test Email with MJML',
          TextPart: 'This is a test email using MJML and Mailjet',
          HTMLPart: html // Send the converted HTML content
        }
      ]
    });

  // Handle request response
  request
    .then((result) => {
      console.log('Email sent successfully:', result.body);
    })
    .catch((err) => {
      console.error('Error sending email:', err.statusCode);
    });
});
