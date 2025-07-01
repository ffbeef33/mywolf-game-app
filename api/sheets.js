import { google } from 'googleapis';

export default async function handler(request, response) {
  try {
    // Lấy thông tin xác thực từ biến môi trường của Vercel
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Xác thực với Google
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Lấy dữ liệu từ sheet "Roles"
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Roles!A:Z', // Đọc toàn bộ sheet Roles
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return response.status(404).json({ error: 'No data found in Roles sheet.' });
    }
    
    // Chuyển đổi dữ liệu từ mảng thành đối tượng JSON
    const headers = rows.shift();
    const data = rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });

    response.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate');
    return response.status(200).json(data);

  } catch (error) {
    console.error('API Route Error:', error);
    return response.status(500).json({ error: 'Failed to fetch data from Google Sheets API.', details: error.message });
  }
}