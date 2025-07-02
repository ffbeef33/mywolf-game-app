import { google } from 'googleapis';

export default async function handler(request, response) {
  // Chỉ chấp nhận phương thức POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { password, type } = request.body;

    if (!password) {
      return response.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu.' });
    }

    // Kiểm tra xem có phải đăng nhập quản trò không
    if (type === 'admin') {
      // Mật khẩu quản trò cố định
      const adminPassword = 'quenmatroi';
      
      if (password === adminPassword) {
        // Đăng nhập quản trò thành công
        return response.status(200).json({
          success: true,
          username: 'Admin',
          type: 'admin',
          message: 'Đăng nhập quản trò thành công.'
        });
      } else {
        // Mật khẩu quản trò không chính xác
        return response.status(401).json({
          success: false,
          message: 'Mật khẩu quản trò không chính xác.'
        });
      }
    }

    // Nếu không phải quản trò, tiếp tục xử lý đăng nhập người chơi
    // --- Logic đọc Google Sheet (tương tự file sheets.js) ---
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Players!A:B', // Chỉ cần đọc cột Username và Password
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return response.status(500).json({ success: false, message: 'Không thể đọc dữ liệu người chơi.' });
    }
    
    const headers = rows.shift(); // Lấy hàng tiêu đề (Username, Password)
    const players = rows.map(row => ({
      Username: row[0] || '',
      Password: row[1] || '',
    }));
    // --- Kết thúc logic đọc Google Sheet ---

    // Tìm người chơi có mật khẩu khớp
    const foundPlayer = players.find(p => p.Password === password);

    if (foundPlayer) {
      // Nếu tìm thấy, trả về thành công và tên người dùng
      return response.status(200).json({ 
        success: true, 
        username: foundPlayer.Username,
        type: 'player',
        message: 'Đăng nhập người chơi thành công.'
      });
    } else {
      // Nếu không tìm thấy, trả về lỗi
      return response.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
    }

  } catch (error) {
    console.error('Login API Error:', error);
    return response.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.' });
  }
}