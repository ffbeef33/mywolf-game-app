// This is a Vercel Serverless Function that acts as a proxy.

export default async function handler(request, response) {
  // Lấy URL của Google Script từ biến môi trường (an toàn hơn)
  // Hoặc bạn có thể dán trực tiếp vào đây nếu muốn
  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

  // Lấy tham số 'action' từ URL yêu cầu của client
  // Ví dụ: /api/proxy?action=getRoles
  const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
  const action = searchParams.get('action');

  if (!action) {
    return response.status(400).json({ error: 'Action parameter is missing' });
  }

  // Xây dựng URL đích đến Google Script
  const targetUrl = `${GOOGLE_SCRIPT_URL}?action=${action}`;

  try {
    // Dùng fetch để gọi đến Google Script từ phía server
    const fetchResponse = await fetch(targetUrl);

    // Kiểm tra nếu Google trả về lỗi
    if (!fetchResponse.ok) {
      throw new Error(`Google Script responded with status: ${fetchResponse.status}`);
    }

    // Lấy dữ liệu JSON từ Google
    const data = await fetchResponse.json();

    // Thiết lập header để trình duyệt không cache lại kết quả
    response.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');
    
    // Gửi dữ liệu thành công về lại cho trình duyệt
    return response.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    return response.status(500).json({ error: 'Failed to fetch data from Google Script.', details: error.message });
  }
}