document.addEventListener('DOMContentLoaded', () => {
    // ▼▼▼ DÁN URL WEB APP BẠN ĐÃ COPY Ở BƯỚC 1 VÀO ĐÂY ▼▼▼
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyU3Wr8o_RR4I8pU-kfNFqmz7l8v7Sw2Ge4ONlNmDUdITr6fihZW1PV5eTHU_iPxLWxbg/exec"; 

    const adminLoginBtn = document.getElementById('admin-login-btn');
    const playerLoginBtn = document.getElementById('player-login-btn');
    const errorMessage = document.getElementById('error-message');
    const ADMIN_PASSWORD = 'quenmatroi';

    adminLoginBtn.addEventListener('click', () => {
        const adminPass = document.getElementById('admin-pass').value;
        if (adminPass === ADMIN_PASSWORD) {
            localStorage.setItem('userType', 'admin');
            window.location.href = 'admin.html';
        } else {
            errorMessage.textContent = 'Mật khẩu quản trò không đúng!';
        }
    });

    playerLoginBtn.addEventListener('click', async () => {
        const playerId = document.getElementById('player-id').value;
        const playerPass = document.getElementById('player-pass').value;
        errorMessage.textContent = 'Đang kiểm tra...';

        if (!playerId || !playerPass) {
            errorMessage.textContent = 'Vui lòng nhập đủ tên và mật khẩu!';
            return;
        }

        try {
            const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getPlayers`);
            const players = await response.json();
            const foundPlayer = players.find(p => p.Username === playerId && p.Password.toString() === playerPass);

            if (foundPlayer) {
                errorMessage.textContent = '';
                localStorage.setItem('userType', 'player');
                localStorage.setItem('playerName', playerId);
                window.location.href = 'player.html';
            } else {
                errorMessage.textContent = 'Tên đăng nhập hoặc mật khẩu không đúng!';
            }
        } catch (error) {
            console.error('Error authenticating player:', error);
            errorMessage.textContent = 'Lỗi kết nối, vui lòng thử lại.';
        }
    });
});