import { google } from 'googleapis';

// --- Cấu hình xác thực Google ---
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
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

      if (!['Roles', 'Players', 'Favor Deck'].includes(sheetName)) {
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
      
      response.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate');

      if (sheetName === 'Favor Deck') {
        const decks = [];
        const deckNames = rows[0] || [];
        // ===== SỬA LỖI DUY NHẤT TẠI ĐÂY: Đọc từ hàng 2 (index 1) thay vì hàng 3 =====
        const playerCounts = rows[1] || []; // Sửa từ rows[2] thành rows[1]
        
        // Bắt đầu từ cột B (index = 1)
        for (let col = 1; col < deckNames.length; col++) {
          const deckName = deckNames[col];
          if (!deckName) continue;

          const deck = {
            deckName: deckName.trim(),
            // Lấy số từ chuỗi "14 Player"
            playerCount: parseInt(playerCounts[col]) || 0,
            roles: [],
          };

          // Bắt đầu từ hàng 4 (index = 3) để đọc vai trò
          for (let row = 3; row < rows.length; row++) {
            if (rows[row] && rows[row][col]) {
              deck.roles.push(rows[row][col].trim());
            }
          }
          decks.push(deck);
        }
        return response.status(200).json(decks);
      }
      
      // Logic cũ cho sheet 'Roles' và 'Players'
      const headers = rows.shift();
      const data = rows.map(row => {
        let obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });

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
        
        const values = payload.map(item => [item.role, item.name]);

        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${gameLogSheetName}!A:B`,
        });

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
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${gameLogSheetName}!A:B`,
        });

        return response.status(200).json({ success: true, message: 'Game log cleared successfully.' });
      }

      return response.status(400).json({ error: 'Invalid action specified.' });

    } catch (error)
    {
      console.error('POST API Error:', error);
      return response.status(500).json({ error: 'Failed to process request.', details: error.message });
    }
  }

  // Nếu phương thức không phải GET hoặc POST
  return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
}