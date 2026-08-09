// api/create-payment.js
// Vercel Serverless Function — Buat transaksi Midtrans

const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, plan, orderId, uid } = req.body;

  if (!email || !plan || !orderId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const prices = {
    monthly:  39000,
    yearly:   249000,
    lifetime: 599000,
  };

  const planNames = {
    monthly:  'cashirqu - Paket Bulanan',
    yearly:   'cashirqu - Paket Tahunan',
    lifetime: 'cashirqu - Paket Seumur Hidup',
  };

  const amount = prices[plan];
  if (!amount) return res.status(400).json({ error: 'Invalid plan' });

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ error: 'MIDTRANS_SERVER_KEY not configured' });

  const authString = Buffer.from(serverKey + ':').toString('base64');
  
  const isSandbox = serverKey.startsWith('SB-');
  const midtransHost = isSandbox ? 'app.sandbox.midtrans.com' : 'app.midtrans.com';

  const payload = JSON.stringify({
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    customer_details: {
      email: email,
    },
    item_details: [{
      id: plan,
      price: amount,
      quantity: 1,
      name: planNames[plan]
    }]
  });

  const options = {
    hostname: midtransHost,
    port: 443,
    path: '/snap/v1/transactions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${authString}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const httpReq = https.request(options, (httpRes) => {
        let data = '';
        httpRes.on('data', (chunk) => { data += chunk; });
        httpRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) resolve(parsed.token);
            else reject(new Error(parsed.error_messages ? parsed.error_messages.join(', ') : 'Midtrans error'));
          } catch (e) {
            reject(e);
          }
        });
      });
      httpReq.on('error', reject);
      httpReq.write(payload);
      httpReq.end();
    });

    return res.status(200).json({ token: result });
  } catch (e) {
    console.error('Midtrans error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
