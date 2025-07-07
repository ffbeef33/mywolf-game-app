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

    let roomListener = null;

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
            listenForMyRoom(userData.username);
        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }
    };

    // --- LOGIC LẮNG NGHE PHÒNG BỀN BỈ ---
    function listenForMyRoom(username) {
        const roomsRef = database.ref('rooms');
        if (roomListener) roomsRef.off('value', roomListener);

        loginError.textContent = 'Đang tìm phòng của bạn...';

        roomListener = roomsRef.on('value', (snapshot) => {
            const allRooms = snapshot.val();
            let playerInfo = null;

            if (allRooms) {
                for (const roomId in allRooms) {
                    const room = allRooms[roomId];
                    if (room.players) {
                        const playerId = Object.keys(room.players).find(key => room.players[key].name === username);
                        if (playerId) {
                            playerInfo = { roomId, playerId, username, role: room.players[playerId].role };
                            break;
                        }
                    }
                }
            }

            if (playerInfo) {
                if (!gameSection.classList.contains('active')) {
                    loginSection.classList.remove('active');
                    loginSection.classList.add('hidden');
                    gameSection.classList.add('active');
                    gameSection.classList.remove('hidden');
                }
                updateGameUI(playerInfo.username, playerInfo.roomId, playerInfo.role);
            } else {
                if (!loginSection.classList.contains('active')) {
                    gameSection.classList.remove('active');
                    gameSection.classList.add('hidden');
                    loginSection.classList.add('active');
                    loginSection.classList.remove('hidden');
                }
                loginError.textContent = 'Không tìm thấy phòng. Quản trò đã tạo game chưa?';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Thử Tìm Lại';
            }
        });
    }

    // --- CÁC HÀM CẬP NHẬT GIAO DIỆN ---
    // Hàm này chỉ cập nhật nội dung, không gắn listener
    function updateGameUI(playerName, roomId, roleData) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;
        
        if (roleData && typeof roleData === 'object' && roleData.name) {
            updateRoleCard(roleData);
            waitingSection.classList.add('hidden');
            roleRevealSection.classList.remove('hidden');
        } else {
            // Reset về màn hình chờ
            waitingSection.classList.remove('hidden');
            roleRevealSection.classList.add('hidden');
            // Đảm bảo thẻ bài úp lại
            if (roleRevealSection.classList.contains('is-flipped')) {
                roleRevealSection.classList.remove('is-flipped');
            }
        }
    }

    // Hàm này chỉ cập nhật thông tin trên thẻ bài
    function updateRoleCard(role) {
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
    }

    // --- EVENT LISTENERS (Gán một lần duy nhất) ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loginBtn.click();
        }
    });

    // SỬA LỖI: Gán sự kiện click cho thẻ bài chỉ một lần duy nhất ở đây
    roleRevealSection.addEventListener('click', () => {
        roleRevealSection.classList.toggle('is-flipped');
    });
});