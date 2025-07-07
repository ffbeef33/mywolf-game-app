const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// --- Cấu hình Firebase Admin SDK ---

// Hàm này được giữ nguyên để đọc biến môi trường một cách an toàn
function getFirebaseCredentials() {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error('Firebase service account key is not set in environment variables.');
    }
    try {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
        console.error("Could not parse Firebase credentials. Please check the format in Vercel environment variables.", e);
        throw new Error('Could not parse Firebase service account key.');
    }
}

const serviceAccount = getFirebaseCredentials();
const databaseURL = process.env.FIREBASE_DATABASE_URL;

// Chỉ khởi tạo app nếu chưa có để tránh lỗi
if (!getApps().length) {
    try {
        initializeApp({
            credential: cert(serviceAccount),
            databaseURL: databaseURL,
        });
    } catch (error) {
        console.error("Firebase admin initialization error", error.stack);
        // Ném lỗi ra ngoài để Vercel ghi nhận lỗi 500 với thông tin chi tiết
        throw new Error("Failed to initialize Firebase Admin SDK.");
    }
}

// --- Hàm xử lý chính ---
// Thay đổi từ 'export default' sang 'module.exports'
module.exports = async (request, response) => {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const db = getDatabase();
    const roomsRef = db.ref('rooms');
    const snapshot = await roomsRef.once('value');
    const allRooms = snapshot.val();

    if (!allRooms) {
      return response.status(200).json([]);
    }

    const activeRooms = Object.keys(allRooms)
      .map(roomId => {
        const roomData = allRooms[roomId];
        return {
          id: roomId,
          createdAt: roomData.createdAt || 0,
          playerCount: roomData.players ? Object.keys(roomData.players).length : 0,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return response.status(200).json(activeRooms);

  } catch (error) {
    console.error('API /api/room Error:', error);
    return response.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách phòng.', details: error.message });
  }
};