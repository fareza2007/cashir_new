// api/verify-payment.js
// Vercel Serverless Function — Verifikasi status pembayaran ke Midtrans

const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ error: 'Server key not configured' });

  const authString = Buffer.from(serverKey + ':').toString('base64');

  const isSandbox = serverKey.startsWith('SB-');
  const midtransHost = isSandbox
    ? 'api.sandbox.midtrans.com'
    : 'api.midtrans.com';

  const options = {
    hostname: midtransHost,
    port: 443,
    path: `/v2/${encodeURIComponent(orderId)}/status`,
    method: 'GET',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Accept': 'application/json'
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const httpReq = https.request(options, (httpRes) => {
        let data = '';
        httpRes.on('data', (chunk) => { data += chunk; });
        httpRes.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      });
      httpReq.on('error', reject);
      httpReq.end();
    });

    // Status yang dianggap sukses
    const successStatuses = ['capture', 'settlement', 'success'];
    const isPaid = successStatuses.includes(result.transaction_status);

    return res.status(200).json({
      isPaid,
      status:      result.transaction_status,
      orderId:     result.order_id,
      amount:      result.gross_amount,
      paymentType: result.payment_type,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
