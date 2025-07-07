import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// --- Cấu hình Firebase Admin SDK ---
// Chỉ khởi tạo app nếu chưa có để tránh lỗi
if (!global._firebaseApp) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    global._firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  } catch (e) {
    console.error("Firebase admin initialization error", e.stack);
  }
}

const db = getDatabase();

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // SỬA LỖI: Truy vấn trực tiếp vào 'rooms' thay vì gốc '/'
    const roomsRef = db.ref('rooms');
    const snapshot = await roomsRef.once('value');
    const allRooms = snapshot.val();

    if (!allRooms) {
      return response.status(200).json([]); // Trả về mảng rỗng nếu không có phòng
    }

    const activeRooms = Object.keys(allRooms).map(roomId => {
      const roomData = allRooms[roomId];
      return {
        id: roomId,
        // Lấy thêm thông tin thời gian tạo và số người chơi
        createdAt: roomData.createdAt || 'Không rõ',
        playerCount: roomData.players ? Object.keys(roomData.players).length : 0,
      };
    });

    return response.status(200).json(activeRooms);

  } catch (error) {
    console.error('Error fetching rooms:', error);
    return response.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách phòng.' });
  }
}