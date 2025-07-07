import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// --- Cấu hình Firebase Admin SDK theo cách an toàn và ổn định hơn ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const databaseURL = process.env.FIREBASE_DATABASE_URL;

// Chỉ khởi tạo app nếu chưa có để tránh lỗi trên môi trường serverless
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: databaseURL,
    });
  } catch (error) {
    console.error("Firebase admin initialization error", error.stack);
  }
}

export default async function handler(request, response) {
  // Chỉ chấp nhận phương thức GET
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Lấy đối tượng database bên trong handler để đảm bảo app đã được khởi tạo
    const db = getDatabase();
    const roomsRef = db.ref('rooms');
    const snapshot = await roomsRef.once('value');
    const allRooms = snapshot.val();

    if (!allRooms) {
      return response.status(200).json([]); // Trả về mảng rỗng nếu không có phòng nào
    }

    // Lọc và lấy thông tin các phòng đang hoạt động
    const activeRooms = Object.keys(allRooms)
      .map(roomId => {
        const roomData = allRooms[roomId];
        return {
          id: roomId,
          createdAt: roomData.createdAt || 'Không rõ',
          playerCount: roomData.players ? Object.keys(roomData.players).length : 0,
        };
      })
      // Sắp xếp các phòng từ mới nhất đến cũ nhất
      .sort((a, b) => b.createdAt - a.createdAt);

    return response.status(200).json(activeRooms);

  } catch (error) {
    console.error('Error fetching rooms:', error);
    return response.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách phòng.', details: error.message });
  }
}