require('dotenv').config();
const puppeteer = require('puppeteer');
const twilio = require('twilio');
const fs = require('fs').promises;
const path = require('path');

const LAST_POST_FILE = path.join(__dirname, 'last_post.json');

const config = {
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  yourPhoneNumber: process.env.YOUR_PHONE_NUMBER,
  eToroUsername: process.env.ETORO_USERNAME || 'TimothyAssi',
  checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5
};

const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

async function getLastPostId() {
  try {
    const data = await fs.readFile(LAST_POST_FILE, 'utf8');
    return JSON.parse(data).lastPostId;
  } catch (error) {
    return null;
  }
}

async function saveLastPostId(postId) {
  await fs.writeFile(LAST_POST_FILE, JSON.stringify({ lastPostId: postId, timestamp: new Date().toISOString() }));
}

let browser = null;

async function fetchEToroUserPosts(username) {
  let page = null;
  try {
    const url = `https://www.etoro.com/people/${username}`;
    console.log(`Fetching posts from: ${url}`);

    if (!browser) {
      console.log('Launching browser...');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to page...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Waiting for content to load...');
    await page.waitForTimeout(5000);

    const posts = await page.evaluate(() => {
      const postElements = [];

      const selectors = [
        '[class*="feed-item"]',
        '[class*="post"]',
        '[data-etoro-automation-id*="feed"]',
        'article',
        '[class*="status"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((el, index) => {
            const text = el.innerText?.trim();
            if (text && text.length > 20) {
              postElements.push({
                id: el.getAttribute('data-id') || el.getAttribute('id') || `post-${Date.now()}-${index}`,
                text: text.substring(0, 300),
                timestamp: new Date().toISOString()
              });
            }
          });
          break;
        }
      }

      return postElements;
    });

    await page.close();

    if (posts.length > 0) {
      console.log(`Successfully extracted ${posts.length} posts`);
    }

    return posts;
  } catch (error) {
    console.error('Error fetching eToro posts:', error.message);
    if (page) await page.close().catch(() => {});
    throw error;
  }
}

async function sendWhatsAppMessage(message) {
  try {
    const result = await client.messages.create({
      body: message,
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${config.yourPhoneNumber}`
    });
    console.log(`WhatsApp message sent successfully: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
    throw error;
  }
}

async function checkForNewPosts() {
  try {
    console.log(`\n[${new Date().toISOString()}] Checking for new posts from @${config.eToroUsername}...`);

    const posts = await fetchEToroUserPosts(config.eToroUsername);

    if (posts.length === 0) {
      console.log('No posts found. eToro may have changed their structure or requires authentication.');
      return;
    }

    console.log(`Found ${posts.length} posts`);

    const lastPostId = await getLastPostId();
    const latestPost = posts[0];

    if (!lastPostId) {
      console.log('First run - saving latest post ID without sending notification');
      await saveLastPostId(latestPost.id);
      return;
    }

    if (latestPost.id !== lastPostId) {
      console.log('New post detected!');
      const message = `New post from @${config.eToroUsername} on eToro:\n\n${latestPost.text}...\n\nView: https://www.etoro.com/people/${config.eToroUsername}`;

      await sendWhatsAppMessage(message);
      await saveLastPostId(latestPost.id);
      console.log('Notification sent successfully!');
    } else {
      console.log('No new posts');
    }
  } catch (error) {
    console.error('Error in checkForNewPosts:', error.message);

    if (error.response) {
      console.error('Response status:', error.response.status);
    }
  }
}

async function validateConfig() {
  const missing = [];

  if (!config.twilioAccountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!config.twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!config.twilioPhoneNumber) missing.push('TWILIO_PHONE_NUMBER');
  if (!config.yourPhoneNumber) missing.push('YOUR_PHONE_NUMBER');

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }

  console.log('Configuration validated successfully');
}

async function cleanup() {
  if (browser) {
    console.log('\nClosing browser...');
    await browser.close();
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  console.log('=== eToro Post Notification System ===');
  console.log(`Monitoring: @${config.eToroUsername}`);
  console.log(`Check interval: ${config.checkIntervalMinutes} minutes`);
  console.log('=====================================\n');

  await validateConfig();

  await checkForNewPosts();

  const intervalMs = config.checkIntervalMinutes * 60 * 1000;
  setInterval(checkForNewPosts, intervalMs);
}

main().catch(console.error);
