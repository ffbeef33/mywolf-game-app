import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// --- Cấu hình Firebase Admin SDK theo cách an toàn và ổn định nhất cho Vercel ---

// SỬA LỖI: Đọc và phân giải biến môi trường một cách an toàn và mạnh mẽ
function getFirebaseCredentials() {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error('Firebase service account key is not set in environment variables.');
    }
    try {
        // Thử parse trực tiếp
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e1) {
        try {
            // Nếu thất bại, thử decode từ Base64 (một cách phổ biến để lưu trữ an toàn)
            const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
            return JSON.parse(decodedKey);
        } catch (e2) {
            // Nếu vẫn thất bại, đây là phương án cuối cùng để xử lý chuỗi JSON bị "escaped"
            console.error("Failed to parse Firebase credentials directly or from Base64. Trying to unescape...");
            try {
                const escapedJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
                const unescapedJson = escapedJson.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                return JSON.parse(unescapedJson);
            } catch (e3) {
                console.error("FATAL: Could not parse Firebase credentials after all attempts.", e3);
                throw new Error('Could not parse Firebase service account key. Please check the format in Vercel environment variables.');
            }
        }
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
    }
}

export default async function handler(request, response) {
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
}