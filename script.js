document.addEventListener('DOMContentLoaded', () => {
    const playerLoginForm = document.getElementById('player-login-form');
    const adminLoginForm = document.getElementById('admin-login-form');
    const errorMessage = document.getElementById('error-message');
    
    // Mật khẩu để vào trang admin, bạn có thể thay đổi
    const ADMIN_PASSWORD = 'quenmatroi'; 

    // --- XỬ LÝ ĐĂNG NHẬP QUẢN TRÒ ---
    adminLoginForm.addEventListener('submit', (event) => {
        event.preventDefault(); // Ngăn form tự gửi đi
        const adminPass = document.getElementById('admin-pass').value;
        if (adminPass === ADMIN_PASSWORD) {
            // Không cần lưu userType, chỉ cần chuyển trang
            window.location.href = 'admin.html';
        } else {
            showError('Mật khẩu quản trò không đúng!');
        }
    });

    // --- XỬ LÝ ĐĂNG NHẬP NGƯỜI CHƠI (LOGIC MỚI) ---
    playerLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Ngăn form tự gửi đi

        const passwordInput = document.getElementById('player-password');
        const roomIdInput = document.getElementById('room-id');
        const submitButton = playerLoginForm.querySelector('button');

        const password = passwordInput.value.trim();
        const roomId = roomIdInput.value.trim();

        if (!password || !roomId) {
            showError('Vui lòng nhập đủ mật khẩu và ID phòng.');
            return;
        }

        showError(''); // Xóa lỗi cũ
        submitButton.disabled = true;
        submitButton.textContent = 'Đang kiểm tra...';

        try {
            // Gọi đến API Route mới để xác thực mật khẩu
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (!data.success) {
                // Nếu API trả về lỗi (sai mật khẩu, lỗi server)
                throw new Error(data.message || 'Có lỗi xảy ra khi đăng nhập.');
            }

            // Đăng nhập thành công, API trả về username
            const username = data.username;

            // Lưu thông tin cần thiết để trang player.html sử dụng
            localStorage.setItem('playerName', username);
            localStorage.setItem('roomId', roomId);
            
            // Chuyển hướng đến trang người chơi
            window.location.href = 'player.html';

        } catch (error) {
            showError(error.message);
            submitButton.disabled = false;
            submitButton.textContent = 'Vào Làng';
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
    }
});