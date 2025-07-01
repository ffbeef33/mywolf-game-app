document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginFormsContainer = document.getElementById('login-forms-container');
    const roomSelectionContainer = document.getElementById('room-selection-container');
    const playerLoginForm = document.getElementById('player-login-form');
    const adminLoginForm = document.getElementById('admin-login-form');
    const welcomePlayerEl = document.getElementById('welcome-player');
    const roomListEl = document.getElementById('room-list');
    const logoutBtn = document.getElementById('logout-btn');
    const errorMessage = document.getElementById('error-message');
    
    const ADMIN_PASSWORD = 'quenmatroi'; 

    // --- XỬ LÝ ĐĂNG NHẬP QUẢN TRÒ ---
    adminLoginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const adminPass = document.getElementById('admin-pass').value;
        if (adminPass === ADMIN_PASSWORD) {
            window.location.href = 'admin.html';
        } else {
            showError('Mật khẩu quản trò không đúng!');
        }
    });

    // --- XỬ LÝ ĐĂNG NHẬP NGƯỜI CHƠI ---
    playerLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const passwordInput = document.getElementById('player-password');
        const submitButton = playerLoginForm.querySelector('button');
        const password = passwordInput.value.trim();

        if (!password) {
            showError('Vui lòng nhập mật khẩu.');
            return;
        }

        showError('');
        submitButton.disabled = true;
        submitButton.textContent = 'Đang kiểm tra...';

        try {
            // Bước 1: Xác thực mật khẩu
            const loginResponse = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const loginData = await loginResponse.json();

            if (!loginData.success) {
                throw new Error(loginData.message || 'Mật khẩu không chính xác.');
            }
            
            // Lưu tên người dùng lại
            localStorage.setItem('loggedInPlayerName', loginData.username);
            
            // Bước 2: Hiển thị danh sách phòng
            showRoomSelection(loginData.username);

        } catch (error) {
            showError(error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Đăng Nhập';
        }
    });

    // --- CÁC HÀM HỖ TRỢ ---
    async function showRoomSelection(username) {
        // Ẩn form đăng nhập, hiện khu vực chọn phòng
        loginFormsContainer.classList.add('hidden');
        roomSelectionContainer.classList.remove('hidden');
        welcomePlayerEl.textContent = `Chào mừng, ${username}!`;
        roomListEl.innerHTML = '<p>Đang tìm các phòng khả dụng...</p>';

        try {
            // Gọi API để lấy danh sách phòng
            const roomsResponse = await fetch('/api/rooms');
            const rooms = await roomsResponse.json();

            roomListEl.innerHTML = ''; // Xóa thông báo "đang tìm"
            if (rooms.length === 0) {
                roomListEl.innerHTML = '<p>Hiện không có phòng nào. Vui lòng chờ Quản trò tạo phòng.</p>';
                return;
            }

            // Tạo nút cho mỗi phòng
            rooms.forEach(room => {
                const roomButton = document.createElement('button');
                roomButton.className = 'room-button';
                roomButton.innerHTML = `
                    <span class="room-id">${room.id}</span>
                    <span class="room-player-count">${room.currentPlayerCount}/${room.totalPlayers} người</span>
                `;
                roomButton.onclick = () => joinRoom(room.id);
                roomListEl.appendChild(roomButton);
            });

        } catch (error) {
            roomListEl.innerHTML = '<p style="color: red;">Lỗi khi tải danh sách phòng.</p>';
        }
    }

    function joinRoom(roomId) {
        const playerName = localStorage.getItem('loggedInPlayerName');
        if (!playerName) {
            showError('Lỗi: Không tìm thấy thông tin người chơi. Vui lòng đăng nhập lại.');
            return;
        }
        // Lưu thông tin cần thiết cho trang player.html
        localStorage.setItem('playerName', playerName);
        localStorage.setItem('roomId', roomId);
        
        // Chuyển trang
        window.location.href = 'player.html';
    }

    // Xử lý đăng xuất
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('loggedInPlayerName');
        roomSelectionContainer.classList.add('hidden');
        loginFormsContainer.classList.remove('hidden');
        showError('');
    });

    function showError(message) {
        errorMessage.textContent = message;
    }
});