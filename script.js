document.addEventListener('DOMContentLoaded', () => {
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const playerLoginBtn = document.getElementById('player-login-btn');
    const errorMessage = document.getElementById('error-message');

    // Mật khẩu quản trò
    const ADMIN_PASSWORD = 'quenmatroi';

    // Xử lý đăng nhập quản trò
    adminLoginBtn.addEventListener('click', () => {
        const adminPass = document.getElementById('admin-pass').value;
        if (adminPass === ADMIN_PASSWORD) {
            // Lưu trạng thái đăng nhập và chuyển hướng
            localStorage.setItem('userType', 'admin');
            window.location.href = 'admin.html';
        } else {
            errorMessage.textContent = 'Mật khẩu quản trò không đúng!';
        }
    });

    // Xử lý đăng nhập người chơi
    playerLoginBtn.addEventListener('click', () => {
        const playerId = document.getElementById('player-id').value;
        const playerPass = document.getElementById('player-pass').value;

        if (!playerId || !playerPass) {
            errorMessage.textContent = 'Vui lòng nhập đủ tên và mật khẩu!';
            return;
        }

        // TODO: Tích hợp Google Sheet để xác thực
        // Giả lập xác thực thành công để phát triển
        console.log(`Đang xác thực người chơi: ${playerId}`);
        
        // Lưu thông tin người chơi và chuyển hướng
        localStorage.setItem('userType', 'player');
        localStorage.setItem('playerName', playerId);
        window.location.href = 'player.html';

        // Nếu xác thực thất bại từ Google Sheet
        // errorMessage.textContent = 'Tên hoặc mật khẩu người chơi không đúng!';
    });
});