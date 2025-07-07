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

    // --- LOGIN LOGIC ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.';
            return;
        }

        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang tìm game...';

        try {
            const apiResponse = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await apiResponse.json();
            if (!userData.success) {
                throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            }
            const username = userData.username;
            
            // Sử dụng logic tìm phòng mới, đáng tin cậy và dứt điểm
            await findAndJoinRoom(username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Tìm và Vào Game';
        }
    };

    // =================================================================
    // === SỬA LỖI DỨT ĐIỂM: Logic tìm phòng mới, đáng tin cậy hơn ===
    // =================================================================
    const findAndJoinRoom = (username) => {
        const roomsRef = database.ref('rooms');
        return new Promise((resolve, reject) => {
            // Dùng .once() để quét các phòng một lần duy nhất, tránh race condition.
            roomsRef.once('value', (snapshot) => {
                if (!snapshot.exists()) {
                    return reject(new Error('Không có phòng chơi nào đang hoạt động.'));
                }

                let playerInfo = null;
                const allRooms = snapshot.val();

                // Lặp qua tất cả các phòng để tìm người chơi
                for (const roomId in allRooms) {
                    const room = allRooms[roomId];
                    if (room.players) {
                        const playerId = Object.keys(room.players).find(key => room.players[key].name === username);
                        if (playerId) {
                            // Khi tìm thấy, lưu lại thông tin và thoát khỏi vòng lặp
                            playerInfo = { roomId, playerId, username };
                            break; 
                        }
                    }
                }

                if (playerInfo) {
                    // Nếu tìm thấy, chuyển đổi giao diện và bắt đầu lắng nghe vai trò
                    loginSection.classList.remove('active');
                    loginSection.classList.add('hidden');
                    
                    gameSection.classList.remove('hidden');
                    gameSection.classList.add('active');
                    
                    initializeGame(playerInfo.username, playerInfo.roomId, playerInfo.playerId);
                    resolve(); // Hoàn thành Promise
                } else {
                    // Nếu không tìm thấy sau khi đã quét hết, báo lỗi.
                    reject(new Error('Hiện tại không có game nào có tên bạn trong danh sách chờ.'));
                }
            }, (error) => {
                // Xử lý lỗi nếu không thể đọc dữ liệu từ Firebase
                console.error("Lỗi đọc dữ liệu Firebase:", error);
                reject(new Error('Không thể kết nối đến máy chủ game.'));
            });
        });
    };

    // --- GAME LOGIC ---
    function initializeGame(playerName, roomId, playerId) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;

        const playerRef = database.ref(`rooms/${roomId}/players/${playerId}`);
        // Cập nhật trạng thái online và xử lý khi mất kết nối
        playerRef.update({ isOnline: true });
        playerRef.onDisconnect().update({ isOnline: false });

        // Gắn trình lắng nghe trực tiếp và bền bỉ vào `role` của chính người chơi này
        const roleRef = database.ref(`rooms/${roomId}/players/${playerId}/role`);
        roleRef.on('value', (snapshot) => {
            const roleData = snapshot.val();
            // Điều kiện kiểm tra vẫn giữ nguyên, rất quan trọng
            if (roleData && typeof roleData === 'object' && roleData.name) {
                updateRoleUI(roleData);
            }
        });

        // Logic lật thẻ bài
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

        // Ẩn màn hình chờ và hiện thẻ bài
        waitingSection.classList.add('hidden');
        roleRevealSection.classList.remove('hidden');
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