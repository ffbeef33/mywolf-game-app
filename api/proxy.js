// Vercel Serverless Function - Phiên bản hoàn thiện

export default async function handler(request, response) {
  // Lấy URL của Google Script từ biến môi trường
  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

  if (!GOOGLE_SCRIPT_URL) {
    return response.status(500).json({ error: "GOOGLE_SCRIPT_URL is not configured in Vercel environment variables." });
  }

  try {
    let targetUrl = GOOGLE_SCRIPT_URL;
    const fetchOptions = {
      method: request.method, // Sử dụng phương thức gốc (GET, POST)
      redirect: 'follow',
    };

    // Nếu là GET, thêm tham số vào URL
    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
      targetUrl += '?' + searchParams.toString();
    }
    
    // Nếu là POST, chuyển tiếp phần body
    if (request.method === 'POST') {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(request.body);
    }

    const fetchResponse = await fetch(targetUrl, fetchOptions);
    const responseText = await fetchResponse.text(); // Lấy phản hồi dưới dạng text trước

    // Cố gắng parse text thành JSON
    try {
      const data = JSON.parse(responseText);
      response.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');
      return response.status(200).json(data);
    } catch (e) {
      // Nếu parse lỗi, có nghĩa là Google đã trả về HTML
      console.error("Failed to parse JSON. Google likely returned an HTML error page.");
      console.error("Response from Google:", responseText); // Log lại trang HTML để debug
      throw new Error("Received non-JSON response from Google Script.");
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    return response.status(500).json({ error: 'Proxy failed to communicate with Google Script.', details: error.message });
  }
}