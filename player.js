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
    const roomIdInput = document.getElementById('room-id-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    const waitingSection = document.getElementById('waiting-section');
    const roleRevealSection = document.getElementById('role-reveal-section');

    // --- LOGIN LOGIC ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        const roomId = roomIdInput.value.trim();

        if (!password || !roomId) {
            loginError.textContent = 'Vui lòng nhập đủ mật khẩu và ID phòng.';
            return;
        }

        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang vào...';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.message || 'Mật khẩu không hợp lệ.');
            
            await joinRoom(roomId, data.username);

        } catch (error) {
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Vào Game';
        }
    };

    const joinRoom = (roomId, username) => {
        const roomRef = database.ref(`rooms/${roomId}`);
        return new Promise((resolve, reject) => {
            roomRef.once('value', (snapshot) => {
                if (!snapshot.exists()) {
                    return reject(new Error('Phòng không tồn tại!'));
                }
                
                const players = snapshot.val().players || {};
                const playerEntry = Object.values(players).find(p => p.name === username);
                const playerId = Object.keys(players).find(key => players[key].name === username);

                if (!playerEntry || !playerId) {
                    return reject(new Error(`Bạn (${username}) không có trong danh sách chơi của phòng này.`));
                }

                // --- Login successful ---
                loginSection.classList.remove('active');
                gameSection.classList.add('active');

                initializeGame(username, roomId, playerId);
                resolve();
            });
        });
    };

    // --- GAME LOGIC ---
    function initializeGame(playerName, roomId, playerId) {
        playerNameDisplay.textContent = playerName;
        roomIdDisplay.textContent = roomId;

        const playerRef = database.ref(`rooms/${roomId}/players/${playerId}`);
        playerRef.update({ isOnline: true });
        playerRef.onDisconnect().update({ isOnline: false });

        // SỬA LỖI: Lắng nghe vai trò
        const roleRef = database.ref(`rooms/${roomId}/players/${playerId}/role`);
        roleRef.on('value', (snapshot) => {
            const roleData = snapshot.val();
            // QUAN TRỌNG: Kiểm tra xem roleData có phải là một object và có thuộc tính 'name' không
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
        // Cập nhật thông tin trên thẻ bài
        document.getElementById('role-name').textContent = role.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${role.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = role.description || 'Chưa có mô tả.';
        
        const roleImage = document.getElementById('role-image');
        const roleFactionEl = document.getElementById('role-faction');
        
        roleImage.src = role.image || 'assets/images/default-role.png'; // Cần có ảnh mặc định
        roleImage.alt = `Hình ảnh cho ${role.name}`;
        
        roleFactionEl.className = 'role-faction'; // Reset class
        if (role.faction === 'Sói') {
            roleFactionEl.classList.add('wolf');
        } else if (role.faction === 'Dân Làng') {
            roleFactionEl.classList.add('villager');
        } else {
            roleFactionEl.classList.add('neutral');
        }

        // Ẩn màn hình chờ và hiện thẻ bài
        waitingSection.classList.add('hidden');
        roleRevealSection.classList.remove('hidden');
    }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') loginBtn.click();
    });
    roomIdInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') loginBtn.click();
    });
});