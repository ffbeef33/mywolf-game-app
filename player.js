document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyAYUuNxsYWI59ahvjKHZujKyTfi95DzNwU",
        authDomain: "mywolf-game.firebaseapp.com",
        databaseURL: "https://mywolf-game-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "mywolf-game",
        storageBucket: "mywolf-game.appspot.com",
        messagingSenderId: "1099375631706",
        appId: "1:1099375631706:web:a1f6ccbcf71b7176046763"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- DOM Elements ---
    const loginSection = document.getElementById('login-section');
    const gameSection = document.getElementById('game-section');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    const waitingSection = document.getElementById('waiting-section');
    const roleRevealSection = document.getElementById('role-reveal-section');

    let roomListener = null; // Biến toàn cục để lưu trữ trình lắng nghe

    // --- LOGIN LOGIC ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.';
            return;
        }
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xác thực...';
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            // Bắt đầu lắng nghe phòng cho người dùng này
            listenForMyRoom(userData.username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }
    };

    // =====================================================================
    // === SỬA LỖI: LOGIC TÌM VÀ LẮNG NGHE PHÒNG BỀN BỈ ===
    // =====================================================================
    function listenForMyRoom(username) {
        const roomsRef = database.ref('rooms');
        
        // Gỡ trình lắng nghe cũ nếu có để tránh việc lắng nghe nhiều lần
        if (roomListener) roomsRef.off('value', roomListener);

        loginError.textContent = 'Đang tìm phòng của bạn...';

        roomListener = roomsRef.on('value', (snapshot) => {
            const allRooms = snapshot.val();
            let playerInfo = null;

            if (allRooms) {
                // Lặp qua tất cả các phòng để tìm người chơi
                for (const roomId in allRooms) {
                    const room = allRooms[roomId];
                    if (room.players) {
                        const playerId = Object.keys(room.players).find(key => room.players[key].name === username);
                        if (playerId) {
                            playerInfo = { 
                                roomId, 
                                playerId, 
                                username, 
                                role: room.players[playerId].role // Lấy luôn dữ liệu vai trò
                            };
                            break;
                        }
                    }
                }
            }

            if (playerInfo) {
                // Nếu tìm thấy phòng -> chuyển sang giao diện game
                if (!gameSection.classList.contains('active')) {
                    loginSection.classList.remove('active');
                    loginSection.classList.add('hidden');
                    gameSection.classList.add('active');
                    gameSection.classList.remove('hidden');
                }
                // Cập nhật giao diện game với thông tin mới nhất
                initializeGame(playerInfo.username, playerInfo.roomId, playerInfo.playerId, playerInfo.role);
            } else {
                // Nếu không tìm thấy phòng (do chưa tạo hoặc đã bị xóa) -> reset về màn hình đăng nhập
                if (!loginSection.classList.contains('active')) {
                    gameSection.classList.remove('active');
                    gameSection.classList.add('hidden');
                    loginSection.classList.add('active');
                    loginSection.classList.remove('hidden');
                }
                loginError.textContent = 'Không tìm thấy phòng nào. Quản trò đã tạo game chưa?';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Thử Tìm Lại';
            }
        });
    }

    // --- GAME LOGIC ---
    function initializeGame(playerName, roomId, playerId, roleData) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;
        
        // Cập nhật trạng thái online (không cần onDisconnect ở đây vì listener chính đã xử lý)
        database.ref(`rooms/${roomId}/players/${playerId}`).update({ isOnline: true });
        
        // Xử lý vai trò ngay lập tức dựa trên dữ liệu từ trình lắng nghe chính
        if (roleData && typeof roleData === 'object' && roleData.name) {
            updateRoleUI(roleData);
        } else {
            resetRoleUI();
        }

        roleRevealSection.addEventListener('click', () => {
            roleRevealSection.classList.toggle('is-flipped');
        });
    }

    function updateRoleUI(role) {
        document.getElementById('role-name').textContent = role.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${role.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = role.description || 'Chưa có mô tả.';
        
        const roleImage = document.getElementById('role-image');
        const roleFactionEl = document.getElementById('role-faction');
        
        roleImage.src = role.image || 'assets/images/default-role.png';
        roleImage.alt = `Hình ảnh cho ${role.name}`;
        
        roleFactionEl.className = 'role-faction'; 
        if (role.faction === 'Phe Sói') roleFactionEl.classList.add('wolf');
        else if (role.faction === 'Phe Dân') roleFactionEl.classList.add('villager');
        else roleFactionEl.classList.add('neutral');

        waitingSection.classList.add('hidden');
        roleRevealSection.classList.remove('hidden');
    }

    function resetRoleUI() {
        waitingSection.classList.remove('hidden');
        roleRevealSection.classList.add('hidden');
        // Đảm bảo thẻ bài không bị lật sẵn cho lần nhận vai trò tiếp theo
        if (roleRevealSection.classList.contains('is-flipped')) {
            roleRevealSection.classList.remove('is-flipped');
        }
    }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loginBtn.click();
        }
    });
});