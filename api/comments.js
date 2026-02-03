const JSONBIN_ID = '6980cc83d0ea881f409b6c12';
const JSONBIN_KEY = process.env.JSONBIN_KEY;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Fetch comments
    try {
      const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
        headers: { 'X-Access-Key': JSONBIN_KEY }
      });
      const data = await response.json();
      return res.status(200).json(data.record?.comments || []);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }

  if (req.method === 'PUT') {
    // Update comments - merge with existing votes data
    try {
      // First, get current data to preserve votes
      const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
        headers: { 'X-Access-Key': JSONBIN_KEY }
      });
      const currentData = await getResponse.json();
      const existingData = currentData.record || {};

      // Merge comments with existing data (preserve votes)
      const updatedData = {
        ...existingData,
        comments: req.body.comments || []
      };

      const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': JSONBIN_KEY
        },
        body: JSON.stringify(updatedData)
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save comments' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
