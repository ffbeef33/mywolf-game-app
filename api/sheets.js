import { google } from 'googleapis';

// --- Cấu hình xác thực Google ---
// Đặt các biến này ở ngoài để có thể tái sử dụng
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  // QUAN TRỌNG: Thay đổi scope để có quyền ghi và xóa
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// --- Hàm chính xử lý request ---
export default async function handler(request, response) {
  // ========================================================
  // === XỬ LÝ YÊU CẦU GET (ĐỌC DỮ LIỆU) ===
  // ========================================================
  if (request.method === 'GET') {
    try {
      const { sheetName = 'Roles' } = request.query;

      if (!['Roles', 'Players'].includes(sheetName)) {
        return response.status(400).json({ error: 'Invalid sheet name specified.' });
      }

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
      });

      const rows = res.data.values;
      if (!rows || rows.length === 0) {
        return response.status(404).json({ error: `No data found in ${sheetName} sheet.` });
      }

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
      console.error('GET API Error:', error);
      return response.status(500).json({ error: 'Failed to fetch data from Google Sheets.', details: error.message });
    }
  }

  // ========================================================
  // === XỬ LÝ YÊU CẦU POST (GHI/XÓA DỮ LIỆU) ===
  // ========================================================
  if (request.method === 'POST') {
    try {
      const { action, payload } = request.body;
      const gameLogSheetName = 'GameLog';

      if (action === 'saveGameLog') {
        if (!payload || !Array.isArray(payload)) {
          return response.status(400).json({ error: 'Invalid payload for saveGameLog.' });
        }
        
        // Chuyển đổi payload thành mảng 2 chiều để ghi vào sheet
        const values = payload.map(item => [item.role, item.name]); // Cột A: Chức năng, Cột B: Tên

        // Trước khi ghi, xóa dữ liệu cũ để đảm bảo log luôn mới
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${gameLogSheetName}!A:B`,
        });

        // Ghi dữ liệu mới
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${gameLogSheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values,
          },
        });

        return response.status(200).json({ success: true, message: 'Game log saved successfully.' });
      }

      if (action === 'clearGameLog') {
        // Xóa toàn bộ dữ liệu trong sheet GameLog
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${gameLogSheetName}!A:B`, // Chỉ định rõ vùng cần xóa
        });

        return response.status(200).json({ success: true, message: 'Game log cleared successfully.' });
      }

      // Nếu action không hợp lệ
      return response.status(400).json({ error: 'Invalid action specified.' });

    } catch (error) {
      console.error('POST API Error:', error);
      return response.status(500).json({ error: 'Failed to process request.', details: error.message });
    }
  }

  // Nếu phương thức không phải GET hoặc POST
  return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
}