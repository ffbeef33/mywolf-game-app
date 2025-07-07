export default function handler(request, response) {
  try {
    const envVars = {
      // Kiểm tra sự tồn tại của các biến
      hasDatabaseUrl: !!process.env.FIREBASE_DATABASE_URL,
      hasServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,

      // Lấy độ dài của các biến (nếu chúng tồn tại)
      databaseUrlLength: process.env.FIREBASE_DATABASE_URL?.length || 0,
      serviceAccountKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,

      // Thử parse service account key để xem có phải là JSON hợp lệ không
      isServiceAccountKeyValidJson: false,
      parseError: null,
    };

    try {
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      envVars.isServiceAccountKeyValidJson = true;
    } catch (e) {
      envVars.isServiceAccountKeyValidJson = false;
      envVars.parseError = e.message;
    }

    response.status(200).json({
      message: "Environment Variable Check",
      variables: envVars,
    });

  } catch (error) {
    response.status(500).json({
      error: "Failed to run debug check",
      details: error.message,
    });
  }
}