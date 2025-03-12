const fs = require('fs');
const Mailjet = require('node-mailjet');

const mailjet = Mailjet.apiConnect(
  '3e14a321932092bef164b8e368bf2c59',
  'd7f2640fdc0c0af2d4fcbe12243f7341'
);

// Define the path to the HTML template
const htmlTemplatePath = './src/templates/index.html';

// Read the HTML file
fs.readFile(htmlTemplatePath, 'utf8', (err, htmlContent) => {
  if (err) {
    console.error('Error reading HTML file:', err);
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
          Subject: 'test email subject',
          TextPart: 'Test Email text part',
          HTMLPart: htmlContent // Send the actual HTML content
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
