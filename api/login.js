import { google } from 'googleapis';

// --- Hàm helper để lấy thông tin xác thực và ID sheet từ biến môi trường ---
function getGoogleSheetConfig() {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    return { credentials, spreadsheetId };
}

// --- Hàm xử lý chính ---
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, username, password, type } = request.body;

    // --- Phân luồng xử lý dựa trên "action" ---
    switch (action) {
        case 'register':
            return await handleRegister(request, response, username, password);
        case 'login':
            return await handleLogin(request, response, password, type);
        default:
            return response.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
    }
}

// --- Logic xử lý Đăng ký ---
async function handleRegister(request, response, username, password) {
    if (!username || !password) {
        return response.status(400).json({ success: false, message: 'Tên và mật khẩu không được để trống.' });
    }

    try {
        const { credentials, spreadsheetId } = getGoogleSheetConfig();
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Cần quyền ghi
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Đọc dữ liệu để kiểm tra tên người dùng đã tồn tại chưa
        const readRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Players!A:A', // Chỉ cần đọc cột Username
        });
        const existingUsers = readRes.data.values ? readRes.data.values.flat() : [];
        if (existingUsers.some(u => u.toLowerCase() === username.toLowerCase())) {
            return response.status(409).json({ success: false, message: 'Tên người chơi này đã tồn tại.' });
        }

        // 2. Nếu chưa tồn tại, ghi người dùng mới vào cuối sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Players!A:B',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[username, password]],
            },
        });

        return response.status(201).json({ success: true, message: 'Đăng ký thành công!' });

    } catch (error) {
        console.error('Register API Error:', error);
        return response.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng ký.' });
    }
}

// --- Logic xử lý Đăng nhập (giữ nguyên logic cũ của bạn) ---
async function handleLogin(request, response, password, type) {
    if (!password) {
        return response.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu.' });
    }
    if (type === 'admin') {
        const adminPassword = 'quenmatroi';
        if (password === adminPassword) {
            return response.status(200).json({ success: true, username: 'Admin', type: 'admin' });
        } else {
            return response.status(401).json({ success: false, message: 'Mật khẩu quản trò không chính xác.' });
        }
    }

    try {
        const { credentials, spreadsheetId } = getGoogleSheetConfig();
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Players!A:B',
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            return response.status(500).json({ success: false, message: 'Không thể đọc dữ liệu người chơi.' });
        }
        
        rows.shift(); // Bỏ qua hàng tiêu đề
        const players = rows.map(row => ({ Username: row[0] || '', Password: row[1] || '' }));
        const foundPlayer = players.find(p => p.Password === password);

        if (foundPlayer) {
            return response.status(200).json({ success: true, username: foundPlayer.Username, type: 'player' });
        } else {
            return response.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
        }
    } catch (error) {
        console.error('Login API Error:', error);
        return response.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.' });
    }
}