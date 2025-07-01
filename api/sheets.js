import { google } from 'googleapis';

export default async function handler(request, response) {
  try {
    // Lấy tên sheet từ query parameter, nếu không có thì mặc định là 'Roles'
    const { sheetName = 'Roles' } = request.query;

    // Để bảo mật, chỉ cho phép truy cập vào các sheet được chỉ định
    if (!['Roles', 'Players'].includes(sheetName)) {
      return response.status(400).json({ error: 'Invalid sheet name specified.' });
    }

    // Lấy thông tin xác thực từ biến môi trường của Vercel
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Xác thực với Google
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Lấy dữ liệu từ sheet được yêu cầu (sử dụng biến sheetName)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`, // Đọc toàn bộ các cột trong sheet được yêu cầu
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return response.status(404).json({ error: `No data found in ${sheetName} sheet.` });
    }
    
    // Chuyển đổi dữ liệu từ mảng thành đối tượng JSON
    // Logic này hoạt động cho cả sheet Roles và Players
    const headers = rows.shift();
    const data = rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        // Gán giá trị cho key tương ứng với header, nếu ô trống thì gán chuỗi rỗng
        obj[header] = row[index] || '';
      });
      return obj;
    });

    // Thiết lập cache để tăng tốc độ cho các lần gọi sau
    response.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate');
    return response.status(200).json(data);

  } catch (error) {
    console.error('API Route Error:', error);
    return response.status(500).json({ error: 'Failed to fetch data from Google Sheets API.', details: error.message });
  }
}