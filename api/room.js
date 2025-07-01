import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// --- Cấu hình Firebase Admin SDK ---
// Chỉ khởi tạo app nếu chưa có
if (!global._firebaseApp) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  global._firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = getDatabase();

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const roomsRef = db.ref('/');
    const snapshot = await roomsRef.once('value');
    const allData = snapshot.val();

    if (!allData) {
      return response.status(200).json([]); // Trả về mảng rỗng nếu không có dữ liệu
    }

    // Lọc và lấy thông tin các phòng đang hoạt động
    const activeRooms = Object.keys(allData)
      .filter(key => key.startsWith('room-'))
      .map(roomId => {
        const roomData = allData[roomId];
        return {
          id: roomId,
          totalPlayers: roomData.totalPlayers || 0,
          // Đếm số người chơi thực tế trong phòng
          currentPlayerCount: roomData.players ? Object.keys(roomData.players).length : 0, 
        };
      });

    return response.status(200).json(activeRooms);

  } catch (error) {
    console.error('Error fetching rooms:', error);
    return response.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách phòng.' });
  }
}